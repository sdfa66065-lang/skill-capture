import { describe, expect, it } from 'vitest';
import {
  INITIAL_COINS,
  LYCHEE_ID,
  LYCHEE_MIN_SPIN_MS,
  LYCHEE_SYMBOLS,
  evaluateLychee,
  lycheeTheoreticalRtp,
  lycheeTotalBet,
} from '@game/shared';
import { openDb } from '../src/db.ts';
import { LycheeMachine, drawGrid } from '../src/lychee/LycheeMachine.ts';
import { Wallet } from '../src/wallet.ts';

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function setup(random = seeded(1)) {
  const db = openDb(':memory:');
  const wallet = new Wallet(db);
  const user = wallet.loginGuest('device-lychee');
  const clock = { t: 1_000_000 };
  let n = 0;
  const machine = new LycheeMachine({ userId: user.id, wallet, random, now: () => clock.t, newSpinId: () => `s${++n}` });
  return { db, wallet, user, clock, machine };
}

describe('九个荔枝结算', () => {
  it('横、竖、斜三连中奖，可以同时中多条', () => {
    // 樱桃占第一行和左斜线
    const grid = [0, 0, 0, 1, 0, 2, 3, 4, 0];
    const r = evaluateLychee(grid, 2);
    expect(r.fullScreen).toBeNull();
    expect(r.lines.map((l) => l.line).sort()).toEqual([0, 6]);
    expect(r.win).toBe(2 * LYCHEE_SYMBOLS[0]!.linePay * 2);
  });

  it('没有三连不中奖', () => {
    expect(evaluateLychee([0, 1, 2, 3, 4, 5, 6, 0, 1], 5)).toMatchObject({ lines: [], win: 0 });
  });

  it('九个荔枝全屏按总押注的全屏赔率派彩', () => {
    const r = evaluateLychee(new Array(9).fill(LYCHEE_ID), 1);
    expect(r.fullScreen).toBe(LYCHEE_ID);
    expect(r.win).toBe(LYCHEE_SYMBOLS[LYCHEE_ID]!.fullPay * lycheeTotalBet(1));
  });

  it('全屏赔率一定高于同符号 8 条线的线奖', () => {
    for (const s of LYCHEE_SYMBOLS) expect(s.fullPay).toBeGreaterThan(s.linePay);
  });

  it('理论回报率在 93%–97% 之间', () => {
    const rtp = lycheeTheoreticalRtp();
    expect(rtp).toBeGreaterThan(0.93);
    expect(rtp).toBeLessThan(0.97);
  });

  it('实际开奖的回报率与理论值一致', () => {
    const random = seeded(99);
    let paid = 0;
    const N = 300_000;
    for (let i = 0; i < N; i++) paid += evaluateLychee(drawGrid(random), 1).win;
    // 每次押 8；大奖方差大，toBeCloseTo(…, 1) 即误差 < 0.05
    expect(paid / (N * 8)).toBeCloseTo(lycheeTheoreticalRtp(), 1);
  });
});

describe('LycheeMachine', () => {
  it('扣押注、派彩，余额与流水一致', () => {
    const { machine, wallet, user, clock, db } = setup();
    let last = INITIAL_COINS;
    for (let i = 0; i < 200; i++) {
      clock.t += LYCHEE_MIN_SPIN_MS;
      const r = machine.spin(5);
      expect(r.coins).toBe(last - 40 + r.win);
      last = r.coins;
    }
    const { total } = db.prepare('SELECT SUM(delta) AS total FROM coin_logs WHERE user_id = ?').get(user.id) as { total: number };
    expect(total).toBe(wallet.balance(user.id));
  });

  it('押注非法、余额不足、转太快都会拒绝', () => {
    const { machine, wallet, user, clock } = setup();
    expect(() => machine.spin(3)).toThrow('BAD_REQUEST');
    machine.spin(1);
    expect(() => machine.spin(1)).toThrow('RATE_LIMIT');
    clock.t += LYCHEE_MIN_SPIN_MS;
    wallet.change(user.id, -wallet.balance(user.id) + 7, 'fish_fire', 'drain');
    expect(() => machine.spin(1)).toThrow('INSUFFICIENT_COINS');
    expect(wallet.balance(user.id)).toBe(7);
  });
});
