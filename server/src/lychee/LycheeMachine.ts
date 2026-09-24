import {
  LYCHEE_LINE_BETS,
  LYCHEE_MIN_SPIN_MS,
  LYCHEE_SYMBOLS,
  evaluateLychee,
  lycheeTotalBet,
  type LycheeOutcome,
} from '@game/shared';
import { GameError } from '../errors.ts';
import type { Wallet } from '../wallet.ts';

export interface LycheeDeps {
  userId: number;
  wallet: Wallet;
  random: () => number;
  now: () => number;
  newSpinId: () => string;
}

const TOTAL_WEIGHT = LYCHEE_SYMBOLS.reduce((s, x) => s + x.weight, 0);

/** 开奖：先按出奖表判断是否直接开全屏，否则九格按权重独立抽取 */
export function drawGrid(random: () => number): number[] {
  let r = random();
  for (const s of LYCHEE_SYMBOLS) {
    r -= s.fullProb;
    if (r < 0) return new Array(9).fill(s.id);
  }
  return Array.from({ length: 9 }, () => {
    let w = random() * TOTAL_WEIGHT;
    for (const s of LYCHEE_SYMBOLS) {
      w -= s.weight;
      if (w < 0) return s.id;
    }
    return 0;
  });
}

/** 每个玩家一台机器：扣押注 → 开奖 → 派彩，结果完全由服务端决定 */
export class LycheeMachine {
  private lastSpinAt = -Infinity;

  constructor(private readonly deps: LycheeDeps) {}

  spin(lineBet: number): LycheeOutcome & { coins: number } {
    const { wallet, userId, random, now, newSpinId } = this.deps;
    if (!(LYCHEE_LINE_BETS as readonly number[]).includes(lineBet)) throw new GameError('BAD_REQUEST');
    if (now() - this.lastSpinAt < LYCHEE_MIN_SPIN_MS) throw new GameError('RATE_LIMIT');

    const spinId = newSpinId();
    let coins = wallet.change(userId, -lycheeTotalBet(lineBet), 'lychee_bet', spinId);
    this.lastSpinAt = now();
    const outcome = evaluateLychee(drawGrid(random), lineBet);
    if (outcome.win > 0) coins = wallet.change(userId, outcome.win, 'lychee_win', spinId);
    return { ...outcome, coins };
  }
}
