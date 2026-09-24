import { INITIAL_COINS, RELIEF_AMOUNT, RELIEF_DAILY_LIMIT, RELIEF_THRESHOLD, type UserInfo } from '@game/shared';
import type { Db } from './db.ts';
import { GameError } from './errors.ts';

export type CoinReason = 'init' | 'relief' | 'fish_fire' | 'fish_catch' | 'zipai_settle';

/**
 * 唯一可以修改金币余额的地方。
 * 每次变动在同一事务内更新余额并写流水；同一 (reason, refId) 只会生效一次。
 */
export class Wallet {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now,
  ) {}

  /** 游客登录：按设备 ID 查找或创建用户，新用户发放初始金币 */
  loginGuest(deviceId: string): UserInfo {
    const existing = this.db
      .prepare('SELECT id, nickname, coins FROM users WHERE device_id = ?')
      .get(deviceId) as UserInfo | undefined;
    if (existing) return existing;

    const { lastInsertRowid } = this.db
      .prepare('INSERT INTO users (device_id, nickname, coins, created_at) VALUES (?, ?, 0, ?)')
      .run(deviceId, '', this.now());
    const id = Number(lastInsertRowid);
    const nickname = `游客${100000 + id}`;
    this.db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(nickname, id);
    const coins = this.change(id, INITIAL_COINS, 'init', String(id));
    return { id, nickname, coins };
  }

  balance(userId: number): number {
    const row = this.db.prepare('SELECT coins FROM users WHERE id = ?').get(userId) as
      | { coins: number }
      | undefined;
    if (!row) throw new GameError('BAD_REQUEST');
    return row.coins;
  }

  /** 修改余额，返回变动后的余额。余额不足抛 INSUFFICIENT_COINS；重复的 (reason, refId) 不会重复生效 */
  change(userId: number, delta: number, reason: CoinReason, refId: string): number {
    if (!Number.isSafeInteger(delta)) throw new GameError('BAD_REQUEST');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const dup = this.db
        .prepare('SELECT 1 FROM coin_logs WHERE reason = ? AND ref_id = ?')
        .get(reason, refId);
      const coins = this.balance(userId);
      if (dup) {
        this.db.exec('COMMIT');
        return coins;
      }
      const after = coins + delta;
      if (after < 0) throw new GameError('INSUFFICIENT_COINS');
      this.db.prepare('UPDATE users SET coins = ? WHERE id = ?').run(after, userId);
      this.db
        .prepare(
          'INSERT INTO coin_logs (user_id, delta, balance_after, reason, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(userId, delta, after, reason, refId, this.now());
      this.db.exec('COMMIT');
      return after;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  /** 破产救济：余额低于门槛时可领，每天有次数上限（按 UTC+8 自然日） */
  claimRelief(userId: number): { coins: number; remainingToday: number } {
    if (this.balance(userId) >= RELIEF_THRESHOLD) throw new GameError('RELIEF_NOT_ELIGIBLE');
    const day = beijingDay(this.now());
    const { n } = this.db
      .prepare("SELECT COUNT(*) AS n FROM coin_logs WHERE user_id = ? AND reason = 'relief' AND ref_id LIKE ?")
      .get(userId, `${userId}:${day}:%`) as { n: number };
    if (n >= RELIEF_DAILY_LIMIT) throw new GameError('RELIEF_LIMIT');
    const coins = this.change(userId, RELIEF_AMOUNT, 'relief', `${userId}:${day}:${n + 1}`);
    return { coins, remainingToday: RELIEF_DAILY_LIMIT - n - 1 };
  }
}

function beijingDay(ms: number): string {
  return new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);
}
