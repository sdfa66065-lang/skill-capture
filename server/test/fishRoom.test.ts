import { describe, expect, it } from 'vitest';
import { FISH_RTP, FISH_TYPES, INITIAL_COINS, MIN_FIRE_INTERVAL_MS, fishPosition } from '@game/shared';
import { openDb } from '../src/db.ts';
import { FishRoom } from '../src/fish/FishRoom.ts';
import { Wallet } from '../src/wallet.ts';

/** 可复现的伪随机数（mulberry32） */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function setup(random = seeded(1)) {
  const wallet = new Wallet(openDb(':memory:'));
  const user = wallet.loginGuest('device-test');
  const clock = { t: 1_000_000 };
  const room = new FishRoom({ roomId: 'r1', userId: user.id, wallet, now: () => clock.t, random });
  return { wallet, user, clock, room };
}

describe('FishRoom', () => {
  it('开炮扣费，炮倍非法或余额不足时拒绝', () => {
    const { room, wallet, user, clock } = setup();
    expect(room.fire(1, 5)).toBe(INITIAL_COINS - 5);
    clock.t += 100;
    expect(() => room.fire(2, 3)).toThrow('BAD_REQUEST');
    wallet.change(user.id, -wallet.balance(user.id), 'fish_fire', 'drain');
    expect(() => room.fire(3, 1)).toThrow('INSUFFICIENT_COINS');
  });

  it('限制射速，子弹 ID 不能重复使用', () => {
    const { room, clock } = setup();
    room.fire(1, 1);
    expect(() => room.fire(2, 1)).toThrow('RATE_LIMIT');
    clock.t += MIN_FIRE_INTERVAL_MS;
    expect(() => room.fire(1, 1)).toThrow('BAD_REQUEST');
  });

  it('一颗子弹只能命中一次；打已消失的鱼不发奖', () => {
    const { room, clock } = setup(() => 0); // random 恒为 0：必定捕获
    const [fish] = room.tick();
    room.fire(1, 1);
    clock.t += 10;
    const r = room.hit(1, fish!.id);
    expect(r.caught).toBe(true);
    expect(r.reward).toBe(FISH_TYPES[fish!.type]!.multiplier);
    expect(() => room.hit(1, fish!.id)).toThrow('BAD_REQUEST');

    clock.t += 100;
    room.fire(2, 1);
    expect(room.hit(2, fish!.id)).toMatchObject({ caught: false, reward: 0 });
  });

  it('鱼游出屏幕后命中无效', () => {
    const { room, clock } = setup(() => 0);
    const [fish] = room.tick();
    clock.t += fish!.duration + 10_000;
    room.fire(1, 1);
    expect(room.hit(1, fish!.id).caught).toBe(false);
  });

  // 每发期望回报 0.95、标准差约 3.4；5 万发时均值标准差约 0.015，±0.05 是 3σ
  it('长期回报率接近 RTP', { timeout: 30_000 }, () => {
    const { room, wallet, user, clock } = setup(seeded(42));
    wallet.change(user.id, 10_000_000, 'fish_catch', 'bankroll');
    const start = wallet.balance(user.id);
    let spent = 0;
    let bulletId = 0;
    for (let i = 0; i < 50_000; i++) {
      clock.t += MIN_FIRE_INTERVAL_MS;
      room.tick();
      const fishes = room.aliveFishes();
      const target = fishes[i % fishes.length]!;
      room.fire(++bulletId, 10);
      spent += 10;
      room.hit(bulletId, target.id);
    }
    const returned = wallet.balance(user.id) - start + spent;
    expect(returned / spent).toBeGreaterThan(FISH_RTP - 0.05);
    expect(returned / spent).toBeLessThan(FISH_RTP + 0.05);
  });

  it('鱼的路径从屏幕外进入、从屏幕外离开', () => {
    const { room } = setup(seeded(7));
    for (const f of room.tick()) {
      const start = fishPosition(f, f.spawnAt);
      const end = fishPosition(f, f.spawnAt + f.duration);
      expect(start.x < 0 || start.x > 1280).toBe(true);
      expect(end.x < 0 || end.x > 1280).toBe(true);
      expect(Math.sign(end.x - start.x)).not.toBe(0);
    }
  });
});
