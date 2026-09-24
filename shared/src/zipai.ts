// 大字牌（跑胡子）简化规则，前后端共用。
//
// 牌用 1..20 的整数表示：1..10 = 小字「一…十」，11..20 = 大字「壹…拾」，每种 4 张共 80 张。
// 0 表示背面朝上（对手看不到的牌）。

export const ZIPAI_RULES = {
  players: 3,
  /** 起胡胡息 */
  minHuxi: 10,
  /** 每囤的金币 = 底分；囤数 = 1 + floor((胡息 - 起胡) / 3) */
  baseScore: 50,
  /** 进场最低金币 */
  minCoins: 500,
  /** 玩家每次操作的时限 */
  turnSeconds: 15,
} as const;

export const SMALL_NAMES = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
export const BIG_NAMES = ['壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖', '拾'];

export const isBig = (c: number) => c > 10;
/** 点数 1..10 */
export const rankOf = (c: number) => (c > 10 ? c - 10 : c);
export const cardName = (c: number) => (c === 0 ? '?' : isBig(c) ? BIG_NAMES[c - 11]! : SMALL_NAMES[c - 1]!);
/** 二、七、十（大小字都算）是红字 */
export const isRed = (c: number) => [2, 7, 10].includes(rankOf(c));

export type MeldType = 'chi' | 'peng' | 'wei' | 'ti' | 'pao';

export interface Meld {
  type: MeldType;
  cards: number[];
}

/** 牌组类型：坎（手里三张相同）、顺子、二七十、绞牌（同点数两小一大或两大一小）、将（对子） */
export type GroupKind = 'kan' | 'shun' | 'ererqishi' | 'jiao' | 'pair';

export interface Group {
  kind: GroupKind;
  cards: number[];
}

/** 判断三张牌是否能组成一句话（吃牌/手牌用），返回类型；不能组成返回 null */
export function tripleKind(cards: readonly number[]): Exclude<GroupKind, 'pair'> | null {
  if (cards.length !== 3) return null;
  const [a, b, c] = [...cards].sort((x, y) => x - y) as [number, number, number];
  if (a === b && b === c) return 'kan';
  const sameCase = isBig(a) === isBig(c);
  const ranks = [rankOf(a), rankOf(b), rankOf(c)];
  if (sameCase && b === a + 1 && c === b + 1) return 'shun';
  if (sameCase && ranks.join() === '2,7,10') return 'ererqishi';
  // 点数相同但不全是同一种字（全相同已在上面判为坎）
  if (ranks[0] === ranks[1] && ranks[1] === ranks[2]) return 'jiao';
  return null;
}

/** 手中牌组的胡息 */
export function groupHuxi(g: Group): number {
  const big = isBig(g.cards[0]!);
  switch (g.kind) {
    case 'kan':
      return big ? 6 : 3;
    case 'shun':
      return rankOf(Math.min(...g.cards)) === 1 ? (big ? 6 : 3) : 0;
    case 'ererqishi':
      return big ? 6 : 3;
    default:
      return 0;
  }
}

/** 亮出来的牌组的胡息 */
export function meldHuxi(m: Meld): number {
  const big = isBig(m.cards[0]!);
  switch (m.type) {
    case 'ti':
      return big ? 12 : 9;
    case 'pao':
      return big ? 9 : 6;
    case 'wei':
      return big ? 6 : 3;
    case 'peng':
      return big ? 3 : 1;
    case 'chi': {
      const kind = tripleKind(m.cards);
      return kind ? groupHuxi({ kind, cards: m.cards }) : 0;
    }
  }
}

/** 计数数组：counts[c] = 牌 c 的张数（下标 1..20） */
export function toCounts(cards: readonly number[]): number[] {
  const counts = new Array<number>(21).fill(0);
  for (const c of cards) counts[c]!++;
  return counts;
}

/**
 * 把手牌拆成若干句话（+ 至多一个将），求胡息最大的拆法。
 * - 牌数 ≡ 0 (mod 3)：全部拆成三张一组
 * - 牌数 ≡ 2 (mod 3)：另外需要一个将（提/跑过之后的情况）
 * - locked 里的牌（原本手里就是坎）必须作为坎，不能拆开
 * 拆不开返回 null。
 */
export function bestDecomposition(
  cards: readonly number[],
  locked: ReadonlySet<number> = new Set(),
): { groups: Group[]; huxi: number } | null {
  const mod = cards.length % 3;
  if (mod === 1) return null;
  const counts = toCounts(cards);
  let best: { groups: Group[]; huxi: number } | null = null;
  const groups: Group[] = [];

  const dfs = (needPair: boolean, huxi: number) => {
    let i = 1;
    while (i <= 20 && counts[i] === 0) i++;
    if (i > 20) {
      if (!needPair && (!best || huxi > best.huxi)) best = { groups: [...groups], huxi };
      return;
    }
    const tryGroup = (kind: GroupKind, g: number[], usesPair = false) => {
      if (g.some((c) => c < 1 || c > 20)) return;
      const need = toCounts(g);
      if (g.some((c) => counts[c]! < need[c]!)) return;
      for (const c of g) counts[c]!--;
      const group = { kind, cards: g };
      groups.push(group);
      dfs(usesPair ? false : needPair, huxi + groupHuxi(group));
      groups.pop();
      for (const c of g) counts[c]!++;
    };

    if (locked.has(i)) {
      tryGroup('kan', [i, i, i]);
      return;
    }
    tryGroup('kan', [i, i, i]);
    if (needPair) tryGroup('pair', [i, i], true);
    const r = rankOf(i);
    if (r <= 8) tryGroup('shun', [i, i + 1, i + 2]);
    if (r === 2) tryGroup('ererqishi', [i, i + 5, i + 8]);
    if (!isBig(i)) {
      // i 是小字时，同点数大字 = i + 10（大字下标更大，还没被消耗）
      tryGroup('jiao', [i, i, i + 10]);
      tryGroup('jiao', [i, i + 10, i + 10]);
    }
  };

  dfs(mod === 2, 0);
  return best;
}

// ---------- 对局视图（服务端按座位过滤后下发） ----------

export type ZipaiAction =
  | { type: 'discard'; card: number }
  | { type: 'hu' }
  | { type: 'peng' }
  | { type: 'chi'; cards: [number, number] }
  | { type: 'pass' };

export type ZipaiEventType = 'draw' | 'discard' | MeldType | 'hu' | 'huang';

export interface ZipaiEvent {
  id: number;
  seat: number;
  type: ZipaiEventType;
  card: number;
}

export interface ZipaiPlayerView {
  nickname: string;
  isBot: boolean;
  handCount: number;
  melds: Meld[];
  discards: number[];
  /** 亮出牌组的胡息（对手的偎/提不计入，避免泄露信息） */
  visibleHuxi: number;
}

export interface ZipaiResult {
  /** null 表示荒庄 */
  winner: number | null;
  huxi: number;
  tun: number;
  /** 本局自己的金币变化 */
  coinsDelta: number;
  winnerHand: Group[];
  winnerMelds: Meld[];
}

export interface ZipaiView {
  round: number;
  mySeat: number;
  dealer: number;
  hand: number[];
  players: ZipaiPlayerView[];
  stockCount: number;
  /** 桌面中央刚摸出或打出的牌 */
  table: { card: number; from: number; source: 'draw' | 'discard' } | null;
  phase: 'discard' | 'claim' | 'auto' | 'ended';
  /** 当前等待谁操作 */
  waitingSeat: number | null;
  /** 我可以做的操作（没轮到我时为空） */
  options: ZipaiAction[];
  deadline: number | null;
  events: ZipaiEvent[];
  result: ZipaiResult | null;
}
