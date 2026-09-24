import { describe, expect, it } from 'vitest';
import { INITIAL_COINS, RELIEF_AMOUNT, RELIEF_DAILY_LIMIT } from '@game/shared';
import { openDb } from '../src/db.ts';
import { Wallet } from '../src/wallet.ts';

function setup(now = () => Date.UTC(2026, 0, 1, 4)) {
  const db = openDb(':memory:');
  return { db, wallet: new Wallet(db, now) };
}

describe('Wallet', () => {
  it('新游客发放初始金币，再次登录不重复发放', () => {
    const { wallet } = setup();
    const u = wallet.loginGuest('device-aaaa');
    expect(u.coins).toBe(INITIAL_COINS);
    expect(u.nickname).toMatch(/^游客\d+$/);
    expect(wallet.loginGuest('device-aaaa')).toEqual(u);
    expect(wallet.loginGuest('device-bbbb').id).not.toBe(u.id);
  });

  it('余额不足时拒绝扣款且余额不变', () => {
    const { wallet } = setup();
    const u = wallet.loginGuest('device-aaaa');
    expect(() => wallet.change(u.id, -INITIAL_COINS - 1, 'fish_fire', 'x')).toThrow('INSUFFICIENT_COINS');
    expect(wallet.balance(u.id)).toBe(INITIAL_COINS);
  });

  it('同一 reason + refId 只生效一次', () => {
    const { wallet, db } = setup();
    const u = wallet.loginGuest('device-aaaa');
    expect(wallet.change(u.id, 50, 'fish_catch', 'r1')).toBe(INITIAL_COINS + 50);
    expect(wallet.change(u.id, 50, 'fish_catch', 'r1')).toBe(INITIAL_COINS + 50);
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM coin_logs WHERE user_id = ?').get(u.id) as { n: number };
    expect(n).toBe(2); // init + 一次 catch
  });

  it('流水余额与账户余额一致', () => {
    const { wallet, db } = setup();
    const u = wallet.loginGuest('device-aaaa');
    wallet.change(u.id, -7, 'fish_fire', 'a');
    wallet.change(u.id, 20, 'fish_catch', 'b');
    const { total } = db.prepare('SELECT SUM(delta) AS total FROM coin_logs WHERE user_id = ?').get(u.id) as {
      total: number;
    };
    expect(total).toBe(wallet.balance(u.id));
  });

  it('救济金：有门槛、每日有上限、次日重置', () => {
    let now = Date.UTC(2026, 0, 1, 4);
    const { wallet } = setup(() => now);
    const u = wallet.loginGuest('device-aaaa');
    expect(() => wallet.claimRelief(u.id)).toThrow('RELIEF_NOT_ELIGIBLE');

    const drain = () => wallet.change(u.id, -wallet.balance(u.id), 'fish_fire', `drain${Math.random()}`);
    for (let i = 0; i < RELIEF_DAILY_LIMIT; i++) {
      drain();
      const r = wallet.claimRelief(u.id);
      expect(r.coins).toBe(RELIEF_AMOUNT);
      expect(r.remainingToday).toBe(RELIEF_DAILY_LIMIT - i - 1);
    }
    drain();
    expect(() => wallet.claimRelief(u.id)).toThrow('RELIEF_LIMIT');

    now += 24 * 3600_000;
    expect(wallet.claimRelief(u.id).coins).toBe(RELIEF_AMOUNT);
  });
});
