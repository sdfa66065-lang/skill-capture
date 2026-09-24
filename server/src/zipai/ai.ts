import { isBig, rankOf, toCounts, tripleKind, groupHuxi, type ZipaiAction } from '@game/shared';

/**
 * 简单 AI：能胡就胡、能碰就碰、吃能带胡息的牌，出牌出最孤立的那张。
 * 玩家超时托管也用这套逻辑。
 */
export function chooseAction(hand: readonly number[], options: readonly ZipaiAction[], tableCard: number | null): ZipaiAction {
  const hu = options.find((o) => o.type === 'hu');
  if (hu) return hu;
  const peng = options.find((o) => o.type === 'peng');
  if (peng) return peng;

  let bestChi: ZipaiAction | null = null;
  let bestHuxi = 0;
  for (const o of options) {
    if (o.type !== 'chi' || tableCard === null) continue;
    const cards = [...o.cards, tableCard];
    const kind = tripleKind(cards)!;
    const huxi = groupHuxi({ kind, cards });
    if (huxi > bestHuxi) {
      bestHuxi = huxi;
      bestChi = o;
    }
  }
  if (bestChi) return bestChi;

  const discards = options.filter((o) => o.type === 'discard');
  if (discards.length) {
    const card = chooseDiscard(hand, discards.map((o) => o.card));
    return { type: 'discard', card };
  }
  return options.find((o) => o.type === 'pass') ?? options[0]!;
}

/** 给每张可出的牌打「有用程度」分，出分最低的 */
export function chooseDiscard(hand: readonly number[], legal: readonly number[]): number {
  const counts = toCounts(hand);
  const has = (c: number) => c >= 1 && c <= 20 && counts[c]! > 0;
  const score = (c: number) => {
    const r = rankOf(c);
    const sameCase = (rr: number) => (rr >= 1 && rr <= 10 ? (isBig(c) ? rr + 10 : rr) : 0);
    let s = (counts[c]! - 1) * 4; // 对子
    if (has(sameCase(r - 1))) s += 2;
    if (has(sameCase(r + 1))) s += 2;
    if (has(sameCase(r - 2))) s += 1;
    if (has(sameCase(r + 2))) s += 1;
    if ([2, 7, 10].includes(r)) s += [2, 7, 10].filter((x) => x !== r && has(sameCase(x))).length * 1.5;
    s += counts[isBig(c) ? c - 10 : c + 10]! * 1.5; // 绞牌
    if (isBig(c)) s += 0.5; // 大字胡息高，稍微留一下
    return s;
  };
  return legal.reduce((best, c) => (score(c) < score(best) ? c : best));
}
