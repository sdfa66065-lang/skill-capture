import { ZIPAI_RULES, meldHuxi, type Meld, type ZipaiAction, type ZipaiView } from '@game/shared';
import { GameError } from '../errors.ts';
import type { Wallet } from '../wallet.ts';
import { chooseAction } from './ai.ts';
import { ZipaiGame } from './ZipaiGame.ts';

/** 机器人思考时间 */
const BOT_DELAY_MS = 900;
/** 自动推进（翻牌、无人要牌等）的间隔，让玩家看得清 */
const STEP_DELAY_MS = 700;

const BOT_NAMES = ['阿福（AI）', '小翠（AI）'];

export interface ZipaiRoomDeps {
  roomId: string;
  userId: number;
  nickname: string;
  wallet: Wallet;
  random: () => number;
  now: () => number;
  send: (view: ZipaiView) => void;
}

/**
 * 1 个真人（固定 0 号座位）+ 2 个机器人。负责计时、机器人行动、托管和结算。
 */
export class ZipaiRoom {
  private game: ZipaiGame | null = null;
  private round = 0;
  private dealer = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private deadline: number | null = null;
  private coinsDelta = 0;
  private settledRound = 0;
  private readonly seats: { nickname: string; isBot: boolean }[];

  constructor(private readonly deps: ZipaiRoomDeps) {
    this.seats = [{ nickname: deps.nickname, isBot: false }, ...BOT_NAMES.map((nickname) => ({ nickname, isBot: true }))];
  }

  /** 开始新的一局 */
  start(): ZipaiView {
    if (this.game && this.game.phase !== 'ended') throw new GameError('BAD_REQUEST');
    if (this.deps.wallet.balance(this.deps.userId) < ZIPAI_RULES.minCoins) throw new GameError('INSUFFICIENT_COINS');
    this.round++;
    this.coinsDelta = 0;
    this.game = ZipaiGame.deal(this.deps.random, this.dealer);
    this.schedule();
    return this.view();
  }

  act(action: ZipaiAction) {
    const game = this.game;
    if (!game || game.pending()?.seat !== 0) throw new GameError('BAD_REQUEST');
    game.act(0, action);
    this.schedule();
  }

  /** 离开房间：未结束的对局由 AI 托管打完并结算，防止输了就跑 */
  leave() {
    this.clearTimer();
    const game = this.game;
    if (!game) return;
    while (game.phase !== 'ended') this.advance(game);
    this.settle();
  }

  view(): ZipaiView {
    const game = this.game!;
    const ended = game.phase === 'ended';
    const pending = game.pending();
    const hideFromMe = (seat: number, m: Meld): Meld =>
      !ended && seat !== 0 && (m.type === 'wei' || m.type === 'ti') ? { ...m, cards: m.cards.map(() => 0) } : m;
    return {
      round: this.round,
      mySeat: 0,
      dealer: game.dealer,
      hand: [...game.players[0]!.hand].sort((a, b) => a - b),
      players: game.players.map((p, seat) => {
        const melds = p.melds.map((m) => hideFromMe(seat, m));
        return {
          ...this.seats[seat]!,
          handCount: p.hand.length,
          melds,
          discards: p.discards,
          visibleHuxi: melds.filter((m) => m.cards[0] !== 0).reduce((s, m) => s + meldHuxi(m), 0),
        };
      }),
      stockCount: game.stockCount,
      table: game.table,
      phase: ended ? 'ended' : pending ? (game.phase === 'discard' ? 'discard' : 'claim') : 'auto',
      waitingSeat: pending?.seat ?? null,
      options: pending?.seat === 0 ? pending.options : [],
      deadline: pending?.seat === 0 ? this.deadline : null,
      events: game.events.slice(-12).map((e) =>
        !ended && e.seat !== 0 && (e.type === 'wei' || e.type === 'ti') ? { ...e, card: 0 } : e,
      ),
      result: game.result && { ...game.result, coinsDelta: this.coinsDelta },
    };
  }

  /** 推进一步：该机器人/托管行动就行动，否则自动推进 */
  private advance(game: ZipaiGame) {
    const pending = game.pending();
    if (!pending) return game.step();
    const hand = game.players[pending.seat]!.hand;
    game.act(pending.seat, chooseAction(hand, pending.options, game.table?.card ?? null));
  }

  private schedule() {
    this.clearTimer();
    const game = this.game!;
    if (game.phase === 'ended') {
      this.settle();
      this.deps.send(this.view());
      return;
    }
    const pending = game.pending();
    let delay = STEP_DELAY_MS;
    if (pending?.seat === 0) {
      delay = ZIPAI_RULES.turnSeconds * 1000;
      this.deadline = this.deps.now() + delay;
    } else if (pending) {
      delay = BOT_DELAY_MS;
    }
    this.deps.send(this.view());
    this.timer = setTimeout(() => {
      this.advance(game); // 真人超时也走这里，由 AI 代打
      this.schedule();
    }, delay);
  }

  private settle() {
    const game = this.game!;
    const result = game.result!;
    if (this.settledRound === this.round) return;
    this.settledRound = this.round;
    if (result.winner === null) return; // 荒庄：不输不赢，庄家不变
    const { wallet, userId, roomId } = this.deps;
    const amount = result.tun * ZIPAI_RULES.baseScore;
    // 机器人金币无限；真人输了最多输光，不会变成负数
    const delta = result.winner === 0 ? amount * (ZIPAI_RULES.players - 1) : -Math.min(amount, wallet.balance(userId));
    wallet.change(userId, delta, 'zipai_settle', `${roomId}:${this.round}`);
    this.coinsDelta = delta;
    this.dealer = result.winner;
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.deadline = null;
  }
}
