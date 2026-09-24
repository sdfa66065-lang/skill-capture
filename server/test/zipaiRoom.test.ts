import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_COINS, ZIPAI_RULES, type ZipaiView } from '@game/shared';
import { openDb } from '../src/db.ts';
import { Wallet } from '../src/wallet.ts';
import { ZipaiRoom } from '../src/zipai/ZipaiRoom.ts';

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function setup(seed = 1) {
  const wallet = new Wallet(openDb(':memory:'));
  const user = wallet.loginGuest('device-zipai');
  const views: ZipaiView[] = [];
  const room = new ZipaiRoom({
    roomId: 'z1',
    userId: user.id,
    nickname: user.nickname,
    wallet,
    random: seeded(seed),
    now: Date.now,
    send: (v) => views.push(v),
  });
  return { wallet, user, room, views };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('ZipaiRoom', () => {
  it('金币不足不能开局', () => {
    const { wallet, user, room } = setup();
    wallet.change(user.id, -(INITIAL_COINS - ZIPAI_RULES.minCoins + 1), 'fish_fire', 'drain');
    expect(() => room.start()).toThrow('INSUFFICIENT_COINS');
  });

  it('玩家一直不操作：超时托管打完一局并结算', () => {
    const { wallet, user, room, views } = setup();
    const first = room.start();
    expect(first.hand.length).toBe(21 - first.players[0]!.melds.reduce((s, m) => s + m.cards.length, 0));
    expect(first.options.length).toBeGreaterThan(0); // 庄家先出牌
    expect(first.deadline).not.toBeNull();

    vi.advanceTimersByTime(60 * 60_000);
    const last = views.at(-1)!;
    expect(last.phase).toBe('ended');
    expect(wallet.balance(user.id)).toBe(INITIAL_COINS + last.result!.coinsDelta);
    // 对手的偎/提在对局中不能看到
    for (const v of views.filter((v) => v.phase !== 'ended')) {
      for (const p of v.players.slice(1)) {
        for (const m of p.melds) if (m.type === 'wei' || m.type === 'ti') expect(m.cards.every((c) => c === 0)).toBe(true);
      }
    }
  });

  it('玩家出牌后轮到机器人', () => {
    const { room, views } = setup();
    const v = room.start();
    const discard = v.options.find((o) => o.type === 'discard')!;
    room.act(discard);
    expect(views.at(-1)!.options).toEqual([]);
    expect(() => room.act(discard)).toThrow('BAD_REQUEST');
  });

  it('中途离开由 AI 托管打完并结算，不能逃跑', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { wallet, user, room } = setup(seed);
      room.start();
      room.leave();
      const view = room.view();
      expect(view.phase).toBe('ended');
      expect(wallet.balance(user.id)).toBe(INITIAL_COINS + view.result!.coinsDelta);
    }
  });

  it('一局结束后才能开下一局，赢家做庄', () => {
    const { room } = setup(3);
    room.start();
    expect(() => room.start()).toThrow('BAD_REQUEST');
    room.leave();
    const winner = room.view().result!.winner;
    const next = room.start();
    expect(next.round).toBe(2);
    if (winner !== null) expect(next.dealer).toBe(winner);
  });
});
