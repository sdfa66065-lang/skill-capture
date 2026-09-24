// 九个荔枝：97 街机风格的 3×3 水果机。
//
// 格子下标（行优先）：
//   0 1 2
//   3 4 5
//   6 7 8
// 8 条线：3 横、3 竖、2 斜。一条线三个相同即中奖；九格全相同是「全屏」大奖。

export interface LycheeSymbol {
  id: number;
  name: string;
  /** 普通转动时每格独立抽取的权重 */
  weight: number;
  /** 一条线三连的赔率（× 单线押注） */
  linePay: number;
  /** 全屏赔率（× 总押注），全屏时只按这个赔，不再算线 */
  fullPay: number;
  /** 直接开出该符号全屏的概率（模拟街机的「大奖」出奖表） */
  fullProb: number;
}

export const LYCHEE_SYMBOLS: readonly LycheeSymbol[] = [
  { id: 0, name: '樱桃', weight: 30, linePay: 11, fullPay: 30, fullProb: 1 / 1_500 },
  { id: 1, name: '橙子', weight: 24, linePay: 17, fullPay: 40, fullProb: 1 / 4_000 },
  { id: 2, name: '铃铛', weight: 18, linePay: 25, fullPay: 60, fullProb: 1 / 6_000 },
  { id: 3, name: '西瓜', weight: 13, linePay: 50, fullPay: 100, fullProb: 1 / 10_000 },
  { id: 4, name: '星星', weight: 8, linePay: 100, fullPay: 200, fullProb: 1 / 20_000 },
  { id: 5, name: '七', weight: 5, linePay: 200, fullPay: 500, fullProb: 1 / 50_000 },
  { id: 6, name: '荔枝', weight: 2, linePay: 500, fullPay: 1000, fullProb: 1 / 100_000 },
];

export const LYCHEE_ID = 6;

export const LYCHEE_LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

/** 单线押注可选值；总押注 = 单线押注 × 8 */
export const LYCHEE_LINE_BETS = [1, 2, 5, 10] as const;

/** 两次转动之间的最短间隔（服务端限制） */
export const LYCHEE_MIN_SPIN_MS = 300;

export interface LycheeLineWin {
  line: number;
  symbol: number;
  win: number;
}

export interface LycheeOutcome {
  grid: number[];
  lines: LycheeLineWin[];
  /** 全屏时的符号，否则为 null */
  fullScreen: number | null;
  win: number;
}

export function lycheeTotalBet(lineBet: number): number {
  return lineBet * LYCHEE_LINES.length;
}

/** 按盘面结算 */
export function evaluateLychee(grid: readonly number[], lineBet: number): LycheeOutcome {
  if (grid.every((s) => s === grid[0])) {
    const sym = LYCHEE_SYMBOLS[grid[0]!]!;
    return { grid: [...grid], lines: [], fullScreen: sym.id, win: sym.fullPay * lycheeTotalBet(lineBet) };
  }
  const lines: LycheeLineWin[] = [];
  LYCHEE_LINES.forEach(([a, b, c], line) => {
    const s = grid[a]!;
    if (s === grid[b] && s === grid[c]) lines.push({ line, symbol: s, win: LYCHEE_SYMBOLS[s]!.linePay * lineBet });
  });
  return { grid: [...grid], lines, fullScreen: null, win: lines.reduce((sum, l) => sum + l.win, 0) };
}

/**
 * 理论回报率：先按 fullProb 直接开全屏，否则九格按权重独立抽取。
 * 独立抽取时每条线期望 = Σ p³ × 线赔率，天然全屏（概率极低）按全屏赔率修正。
 */
export function lycheeTheoreticalRtp(): number {
  const total = LYCHEE_SYMBOLS.reduce((s, x) => s + x.weight, 0);
  const pFull = LYCHEE_SYMBOLS.reduce((s, x) => s + x.fullProb, 0);
  let fullEv = 0;
  let freeEv = 0;
  for (const s of LYCHEE_SYMBOLS) {
    const p = s.weight / total;
    fullEv += s.fullProb * s.fullPay;
    // 8 条线 × p³ × linePay × 单线押注 ÷ 总押注(8 × 单线押注) = p³ × linePay
    freeEv += p ** 3 * s.linePay;
    // 天然全屏：8 条线全中的线奖（linePay × 总押注）换成全屏奖
    freeEv += p ** 9 * (s.fullPay - s.linePay);
  }
  return fullEv + (1 - pFull) * freeEv;
}
