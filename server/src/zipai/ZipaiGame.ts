import {
  ZIPAI_RULES,
  bestDecomposition,
  meldHuxi,
  rankOf,
  isBig,
  toCounts,
  type Group,
  type Meld,
  type MeldType,
  type ZipaiAction,
  type ZipaiEvent,
  type ZipaiEventType,
} from '@game/shared';
import { GameError } from '../errors.ts';

const N = ZIPAI_RULES.players;
const next = (seat: number) => (seat + 1) % N;

export interface PlayerState {
  hand: number[];
  melds: Meld[];
  discards: number[];
  /** 已经提/跑的次数：第一次提/跑后要出牌，之后不用 */
  tiCount: number;
}

interface Table {
  card: number;
  from: number;
  source: 'draw' | 'discard';
}

type QueueItem = { kind: 'prompt'; seat: number; options: ZipaiAction[] } | { kind: 'auto' };

interface AutoAction {
  seat: number;
  type: 'ti' | 'pao' | 'wei';
  /** 升级已亮出的偎/碰（手牌不减少） */
  upgrade: boolean;
}

export interface GameResult {
  winner: number | null;
  huxi: number;
  tun: number;
  winnerHand: Group[];
  winnerMelds: Meld[];
}

export type Phase = 'discard' | 'draw' | 'claim' | 'ended';

/** 80 张牌：1..20 各 4 张 */
export function newDeck(): number[] {
  const deck: number[] = [];
  for (let c = 1; c <= 20; c++) deck.push(c, c, c, c);
  return deck;
}

export function shuffle<T>(arr: T[], random: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/**
 * 大字牌对局状态机（不含计时）。
 *
 * 流程：
 * - 摸牌（draw）：从牌墩翻一张到桌面，按优先级依次处理：胡 → 自动提/偎/跑 → 碰 → 吃；
 *   没人要就进摸牌人的弃牌区，下家接着摸。摸到的牌不进手牌。
 * - 吃/碰/偎 之后要出一张牌；第一次提/跑之后也要出牌，之后的提/跑不用。
 * - 出的牌同样放到桌面，其他人可以胡/跑/碰，下家可以吃。
 * - 手里的坎（三张相同）不能拆开吃碰，也不能打出。
 *
 * 外部用法：pending() 不为空时等待该座位 act()；为空且未结束时调用 step() 推进。
 */
export class ZipaiGame {
  readonly players: PlayerState[];
  phase: Phase;
  turn: number;
  table: Table | null = null;
  result: GameResult | null = null;
  readonly events: ZipaiEvent[] = [];
  private queue: QueueItem[] = [];

  constructor(
    private readonly stock: number[],
    readonly dealer: number,
  ) {
    this.players = Array.from({ length: N }, () => ({ hand: [], melds: [], discards: [], tiCount: 0 }));
    for (let i = 0; i < N; i++) {
      const seat = (dealer + i) % N;
      this.players[seat]!.hand = this.stock.splice(0, seat === dealer ? 21 : 20);
    }
    // 起手四张相同直接提
    for (const [seat, p] of this.players.entries()) {
      const counts = toCounts(p.hand);
      for (let c = 1; c <= 20; c++) {
        if (counts[c] === 4) {
          this.removeFromHand(seat, [c, c, c, c]);
          p.melds.push({ type: 'ti', cards: [c, c, c, c] });
          p.tiCount++;
          this.log(seat, 'ti', c);
        }
      }
    }
    // 庄家先出一张（起手提过也一样，相当于第一次提之后出牌）
    this.turn = dealer;
    this.phase = 'discard';
  }

  /**
   * 洗牌发牌。同一个人起手两提以上时手牌数对不上，直接重洗（概率很低）。
   */
  static deal(random: () => number, dealer: number): ZipaiGame {
    for (;;) {
      const deck = shuffle(newDeck(), random);
      const hands = [0, 1, 2].map((i) => {
        const start = i === 0 ? 0 : 21 + (i - 1) * 20;
        return deck.slice(start, start + (i === 0 ? 21 : 20));
      });
      if (hands.every((h) => toCounts(h).filter((n) => n === 4).length < 2)) return new ZipaiGame(deck, dealer);
    }
  }

  get stockCount() {
    return this.stock.length;
  }

  /** 当前等待操作的座位和可选操作；需要自动推进或已结束时返回 null */
  pending(): { seat: number; options: ZipaiAction[] } | null {
    if (this.phase === 'discard') {
      return { seat: this.turn, options: this.legalDiscards(this.turn).map((card) => ({ type: 'discard', card })) };
    }
    if (this.phase === 'claim') {
      const head = this.queue[0];
      if (head?.kind === 'prompt') return { seat: head.seat, options: head.options };
    }
    return null;
  }

  /** 自动推进一步：摸牌、自动提/偎/跑，或无人要牌时进弃牌区 */
  step() {
    if (this.pending() || this.phase === 'ended') throw new Error('step() while waiting for input');
    if (this.phase === 'draw') {
      const card = this.stock.shift();
      if (card === undefined) {
        this.result = { winner: null, huxi: 0, tun: 0, winnerHand: [], winnerMelds: [] };
        this.phase = 'ended';
        this.log(this.turn, 'huang', 0);
        return;
      }
      this.log(this.turn, 'draw', card);
      this.putOnTable({ card, from: this.turn, source: 'draw' });
      return;
    }
    // claim 阶段
    const table = this.table!;
    const head = this.queue.shift();
    if (head?.kind === 'auto') {
      this.applyAuto(this.autoAction(table)!, table.card);
      return;
    }
    // 没人要：进弃牌区，下家摸牌
    this.players[table.from]!.discards.push(table.card);
    this.table = null;
    this.phase = 'draw';
    this.turn = next(table.from);
  }

  act(seat: number, action: ZipaiAction) {
    const p = this.pending();
    if (!p || p.seat !== seat || !p.options.some((o) => sameAction(o, action))) throw new GameError('BAD_REQUEST');

    switch (action.type) {
      case 'discard':
        this.removeFromHand(seat, [action.card]);
        this.log(seat, 'discard', action.card);
        this.putOnTable({ card: action.card, from: seat, source: 'discard' });
        return;
      case 'pass':
        this.queue.shift();
        return;
      case 'hu':
        return this.finish(seat);
      case 'peng': {
        const c = this.table!.card;
        this.removeFromHand(seat, [c, c]);
        return this.meld(seat, 'peng', [c, c, c]);
      }
      case 'chi':
        this.removeFromHand(seat, action.cards);
        return this.meld(seat, 'chi', [...action.cards, this.table!.card].sort((a, b) => a - b));
    }
  }

  // ---------- 规则 ----------

  /** 能打出的牌：手里有、且不是坎 */
  legalDiscards(seat: number): number[] {
    const counts = toCounts(this.players[seat]!.hand);
    const out: number[] = [];
    for (let c = 1; c <= 20; c++) if (counts[c]! > 0 && counts[c]! < 3) out.push(c);
    return out;
  }

  /** 用桌面上的牌能不能胡；能胡返回胡息最大的拆法 */
  huInfo(seat: number, card: number): { huxi: number; groups: Group[] } | null {
    const p = this.players[seat]!;
    const counts = toCounts(p.hand);
    if (counts[card] === 3) return null; // 这种情况是提/跑，不是胡
    const locked = new Set<number>();
    for (let c = 1; c <= 20; c++) if (counts[c] === 3) locked.add(c);
    const dec = bestDecomposition([...p.hand, card], locked);
    if (!dec) return null;
    const huxi = dec.huxi + p.melds.reduce((s, m) => s + meldHuxi(m), 0);
    return huxi >= ZIPAI_RULES.minHuxi ? { huxi, groups: dec.groups } : null;
  }

  /** 吃牌的所有组合（手里拿出的两张） */
  chiOptions(seat: number, card: number): [number, number][] {
    const counts = toCounts(this.players[seat]!.hand);
    const usable = (c: number) => c >= 1 && c <= 20 && counts[c]! > 0 && counts[c]! < 3;
    const r = rankOf(card);
    const base = isBig(card) ? 10 : 0;
    const other = isBig(card) ? card - 10 : card + 10;
    const candidates: [number, number][] = [];
    if (r >= 3) candidates.push([card - 2, card - 1]);
    if (r >= 2 && r <= 9) candidates.push([card - 1, card + 1]);
    if (r <= 8) candidates.push([card + 1, card + 2]);
    if ([2, 7, 10].includes(r)) {
      const [a, b] = [2, 7, 10].filter((x) => x !== r) as [number, number];
      candidates.push([base + a, base + b]);
    }
    candidates.push([card, other], [other, other]);

    const seen = new Set<string>();
    return candidates.filter(([a, b]) => {
      const key = [a, b].sort((x, y) => x - y).join();
      if (seen.has(key)) return false;
      seen.add(key);
      if (!usable(a) || !usable(b)) return false;
      if (a === b && counts[a]! < 2) return false;
      return this.hasDiscardAfter(seat, [a, b]);
    });
  }

  private hasDiscardAfter(seat: number, removed: number[]): boolean {
    const hand = [...this.players[seat]!.hand];
    for (const c of removed) hand.splice(hand.indexOf(c), 1);
    const counts = toCounts(hand);
    return counts.some((n, c) => c > 0 && n > 0 && n < 3);
  }

  private autoAction(t: Table): AutoAction | null {
    const order = t.source === 'draw' ? [t.from, next(t.from), next(next(t.from))] : [next(t.from), next(next(t.from))];
    for (const seat of order) {
      const p = this.players[seat]!;
      const inHand = toCounts(p.hand)[t.card]!;
      const shown = p.melds.find((m) => (m.type === 'wei' || m.type === 'peng') && m.cards[0] === t.card);
      const isDrawer = t.source === 'draw' && seat === t.from;
      if (inHand === 3) return { seat, type: isDrawer ? 'ti' : 'pao', upgrade: false };
      if (shown) return { seat, type: isDrawer && shown.type === 'wei' ? 'ti' : 'pao', upgrade: true };
      if (isDrawer && inHand === 2) return { seat, type: 'wei', upgrade: false };
    }
    return null;
  }

  private putOnTable(t: Table) {
    this.table = t;
    this.phase = 'claim';
    const { card, from, source } = t;
    const others = [next(from), next(next(from))];
    const order = source === 'draw' ? [from, ...others] : others;

    const queue: QueueItem[] = [];
    for (const seat of order) {
      if (this.huInfo(seat, card)) queue.push({ kind: 'prompt', seat, options: [{ type: 'hu' }, { type: 'pass' }] });
    }
    if (this.autoAction(t)) {
      queue.push({ kind: 'auto' });
    } else {
      // 碰和吃：同一个人两种都能做时合并成一次询问
      const options = new Map<number, ZipaiAction[]>();
      for (const seat of others) {
        if (toCounts(this.players[seat]!.hand)[card] === 2 && this.hasDiscardAfter(seat, [card, card])) {
          options.set(seat, [{ type: 'peng' }]);
        }
      }
      for (const seat of source === 'draw' ? [from, next(from)] : [next(from)]) {
        const chis = this.chiOptions(seat, card).map((cards): ZipaiAction => ({ type: 'chi', cards }));
        if (chis.length) options.set(seat, [...(options.get(seat) ?? []), ...chis]);
      }
      for (const [seat, opts] of options) queue.push({ kind: 'prompt', seat, options: [...opts, { type: 'pass' }] });
    }
    this.queue = queue;
  }

  private applyAuto(a: AutoAction, card: number) {
    const p = this.players[a.seat]!;
    if (a.upgrade) {
      const m = p.melds.find((m) => (m.type === 'wei' || m.type === 'peng') && m.cards[0] === card)!;
      m.type = a.type;
      m.cards = [card, card, card, card];
      this.log(a.seat, a.type, card);
      return this.afterMeld(a.seat, a.type);
    }
    const n = a.type === 'wei' ? 2 : 3;
    this.removeFromHand(a.seat, new Array(n).fill(card));
    this.meld(a.seat, a.type, new Array(n + 1).fill(card));
  }

  private meld(seat: number, type: MeldType, cards: number[]) {
    this.players[seat]!.melds.push({ type, cards });
    this.log(seat, type, this.table!.card);
    this.afterMeld(seat, type);
  }

  private afterMeld(seat: number, type: MeldType) {
    const p = this.players[seat]!;
    let needDiscard = true;
    if (type === 'ti' || type === 'pao') {
      needDiscard = p.tiCount === 0;
      p.tiCount++;
    }
    this.table = null;
    this.queue = [];
    if (needDiscard && this.legalDiscards(seat).length > 0) {
      this.phase = 'discard';
      this.turn = seat;
    } else {
      this.phase = 'draw';
      this.turn = next(seat);
    }
  }

  private finish(seat: number) {
    const card = this.table!.card;
    const info = this.huInfo(seat, card)!;
    const tun = 1 + Math.floor((info.huxi - ZIPAI_RULES.minHuxi) / 3);
    this.result = {
      winner: seat,
      huxi: info.huxi,
      tun,
      winnerHand: info.groups,
      winnerMelds: this.players[seat]!.melds,
    };
    this.phase = 'ended';
    this.queue = [];
    this.log(seat, 'hu', card);
  }

  private removeFromHand(seat: number, cards: number[]) {
    const hand = this.players[seat]!.hand;
    for (const c of cards) {
      const i = hand.indexOf(c);
      if (i < 0) throw new Error(`card ${c} not in hand of seat ${seat}`);
      hand.splice(i, 1);
    }
  }

  private log(seat: number, type: ZipaiEventType, card: number) {
    this.events.push({ id: this.events.length + 1, seat, type, card });
  }
}

function sameAction(a: ZipaiAction, b: ZipaiAction): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'discard' && b.type === 'discard') return a.card === b.card;
  if (a.type === 'chi' && b.type === 'chi') {
    return Array.isArray(b.cards) && [...a.cards].sort().join() === [...b.cards].sort().join();
  }
  return true;
}
