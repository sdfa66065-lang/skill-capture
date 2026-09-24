import {
  BULLET_LIFETIME_MS,
  CANNON_LEVELS,
  FISH_RTP,
  FISH_TYPES,
  MAX_BULLETS,
  MIN_FIRE_INTERVAL_MS,
  createFishPath,
  pickFishType,
  type FishHitResult,
  type FishState,
} from '@game/shared';
import { GameError } from '../errors.ts';
import type { Wallet } from '../wallet.ts';

/** 场上鱼的目标数量 */
const TARGET_FISH = 18;
/** 服务端对鱼存活时间的宽容（抵消网络延迟） */
const HIT_GRACE_MS = 500;

interface Bullet {
  level: number;
  firedAt: number;
}

export interface FishRoomDeps {
  roomId: string;
  userId: number;
  wallet: Wallet;
  now: () => number;
  random: () => number;
}

/**
 * 单人捕鱼房间。客户端只负责表现，扣费、命中判定、发奖都在这里完成。
 * 鱼的位置由 FishState 的路径 + 时间确定，客户端和服务端各自计算即可。
 */
export class FishRoom {
  private readonly fishes = new Map<number, FishState>();
  private readonly bullets = new Map<number, Bullet>();
  private readonly usedBulletIds = new Set<number>();
  private nextFishId = 1;
  private lastFireAt = -Infinity;

  constructor(private readonly deps: FishRoomDeps) {}

  aliveFishes(): FishState[] {
    return [...this.fishes.values()];
  }

  /** 定时调用：清理过期的鱼和子弹，补充新鱼，返回新生成的鱼 */
  tick(): FishState[] {
    const now = this.deps.now();
    for (const [id, f] of this.fishes) {
      if (now > f.spawnAt + f.duration + HIT_GRACE_MS) this.fishes.delete(id);
    }
    for (const [id, b] of this.bullets) {
      if (now - b.firedAt > BULLET_LIFETIME_MS + 5_000) this.bullets.delete(id);
    }
    const spawned: FishState[] = [];
    // 每次最多补 2 条，让鱼陆续进场而不是一次涌入
    for (let i = 0; i < 2 && this.fishes.size < TARGET_FISH; i++) {
      spawned.push(this.spawnFish(now));
    }
    return spawned;
  }

  private spawnFish(now: number): FishState {
    const type = pickFishType(this.deps.random);
    const { path, duration } = createFishPath(this.deps.random, type);
    const fish: FishState = { id: this.nextFishId++, type: type.id, spawnAt: now, duration, path };
    this.fishes.set(fish.id, fish);
    return fish;
  }

  /** 开炮：扣除 炮倍 金币，返回余额 */
  fire(bulletId: number, level: number): number {
    const now = this.deps.now();
    if (!Number.isSafeInteger(bulletId) || !(CANNON_LEVELS as readonly number[]).includes(level)) {
      throw new GameError('BAD_REQUEST');
    }
    if (this.usedBulletIds.has(bulletId)) throw new GameError('BAD_REQUEST');
    if (now - this.lastFireAt < MIN_FIRE_INTERVAL_MS) throw new GameError('RATE_LIMIT');
    if (this.bullets.size >= MAX_BULLETS) throw new GameError('TOO_MANY_BULLETS');

    const coins = this.deps.wallet.change(this.deps.userId, -level, 'fish_fire', `${this.deps.roomId}:b${bulletId}`);
    this.usedBulletIds.add(bulletId);
    this.bullets.set(bulletId, { level, firedAt: now });
    this.lastFireAt = now;
    return coins;
  }

  /** 子弹命中：消耗子弹，按 RTP / 倍率 的概率判定捕获 */
  hit(bulletId: number, fishId: number): FishHitResult {
    const bullet = this.bullets.get(bulletId);
    if (!bullet) throw new GameError('BAD_REQUEST');
    this.bullets.delete(bulletId);

    const { userId, wallet, roomId } = this.deps;
    const miss = { bulletId, fishId, caught: false, reward: 0 };
    const fish = this.fishes.get(fishId);
    const now = this.deps.now();
    // 鱼已被捕获或已游出屏幕：子弹作废，不退款
    if (!fish || now < fish.spawnAt || now > fish.spawnAt + fish.duration + HIT_GRACE_MS) {
      return { ...miss, coins: wallet.balance(userId) };
    }

    const type = FISH_TYPES[fish.type]!;
    if (this.deps.random() >= FISH_RTP / type.multiplier) {
      return { ...miss, coins: wallet.balance(userId) };
    }

    this.fishes.delete(fishId);
    const reward = type.multiplier * bullet.level;
    const coins = wallet.change(userId, reward, 'fish_catch', `${roomId}:f${fishId}`);
    return { bulletId, fishId, caught: true, reward, coins };
  }
}
