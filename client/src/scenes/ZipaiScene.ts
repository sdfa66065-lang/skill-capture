import Phaser from 'phaser';
import {
  ZIPAI_RULES,
  cardName,
  isRed,
  toCounts,
  type Group,
  type Meld,
  type ZipaiAction,
  type ZipaiEvent,
  type ZipaiView,
} from '@game/shared';
import { net, NetError } from '../net.ts';
import { session } from '../session.ts';
import { FONT, button, errorText, text, toast } from '../ui.ts';

const W = 1280;
const H = 720;

type CardSize = 'L' | 'M' | 'S';
const SIZES: Record<CardSize, { w: number; h: number; font: number }> = {
  L: { w: 80, h: 112, font: 56 },
  M: { w: 52, h: 76, font: 36 },
  S: { w: 30, h: 42, font: 22 },
};

const EVENT_TEXT: Partial<Record<ZipaiEvent['type'], string>> = {
  chi: '吃',
  peng: '碰',
  wei: '偎',
  ti: '提',
  pao: '跑',
  hu: '胡',
};

/** 座位在屏幕上的位置：自己在下，下家（1）在右，上家（2）在左 */
const SEAT_SIDE = ['bottom', 'right', 'left'] as const;

/**
 * 大字牌界面：每次收到服务端状态就整体重绘（对象数量不多，足够快）。
 */
export class ZipaiScene extends Phaser.Scene {
  private view: ZipaiView | null = null;
  private layer!: Phaser.GameObjects.Container;
  private timerText!: Phaser.GameObjects.Text;
  private selected: number | null = null;
  private lastEventId = 0;
  private unsubscribe: (() => void)[] = [];

  constructor() {
    super('Zipai');
  }

  create() {
    this.view = null;
    this.selected = null;
    this.lastEventId = 0;

    const g = this.add.graphics();
    g.fillGradientStyle(0x1f5f3f, 0x1f5f3f, 0x0d2e1f, 0x0d2e1f, 1);
    g.fillRect(0, 0, W, H);
    this.layer = this.add.container(0, 0);
    this.timerText = text(this, 0, 0, '', 26, '#ffe8a3').setDepth(50).setVisible(false);

    button(this, 90, 40, '← 大厅', () => this.scene.start('Lobby'), { width: 140, height: 50, fontSize: 22 }).setDepth(60);

    this.unsubscribe.push(net.on('zipai.state', (v) => this.render(v)));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe.forEach((u) => u());
      this.unsubscribe = [];
      net.request('zipai.leave', {}).catch(() => {});
    });

    net
      .request('zipai.enter', {})
      .then((v) => this.render(v))
      .catch((e) => {
        toast(this, errorText(e instanceof NetError ? e.code : 'INTERNAL'));
        this.time.delayedCall(1500, () => this.scene.start('Lobby'));
      });
  }

  update() {
    const v = this.view;
    if (!v?.deadline) {
      this.timerText.setVisible(false);
      return;
    }
    const left = Math.max(0, Math.ceil((v.deadline - net.serverNow()) / 1000));
    this.timerText.setText(`⏱ ${left}`).setVisible(true).setColor(left <= 5 ? '#ff6b6b' : '#ffe8a3');
  }

  // ---------- 绘制 ----------

  private render(v: ZipaiView) {
    if (this.view && v.round !== this.view.round) this.lastEventId = 0;
    this.view = v;
    this.layer.removeAll(true);
    if (this.selected !== null && !v.hand.includes(this.selected)) this.selected = null;

    this.add2(text(this, W / 2, 40, `第 ${v.round} 局 · 剩余 ${v.stockCount} 张 · 底分 ${ZIPAI_RULES.baseScore} · ${ZIPAI_RULES.minHuxi} 胡息起胡`, 22));

    for (const seat of [1, 2]) this.drawOpponent(v, seat);
    this.drawMe(v);
    this.drawTable(v);
    this.drawOptions(v);
    this.placeTimer(v);
    this.showNewEvents(v);
    if (v.result) this.drawResult(v);
  }

  private add2<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.layer.add(obj);
    return obj;
  }

  private card(x: number, y: number, card: number, size: CardSize, opts: { dim?: boolean } = {}) {
    const { w, h, font } = SIZES[size];
    const g = this.add.graphics();
    if (card === 0) {
      g.fillStyle(0x2d6a4f).fillRoundedRect(-w / 2, -h / 2, w, h, 5);
      g.lineStyle(2, 0x95d5b2, 0.8).strokeRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 4);
      return this.add2(this.add.container(x, y, [g]).setSize(w, h));
    }
    g.fillStyle(opts.dim ? 0xcfc6a8 : 0xfdf6e3).fillRoundedRect(-w / 2, -h / 2, w, h, 5);
    g.lineStyle(1.5, 0x6b5b3e).strokeRoundedRect(-w / 2, -h / 2, w, h, 5);
    const t = this.add
      .text(0, 0, cardName(card), { fontFamily: FONT, fontSize: `${font}px`, color: isRed(card) ? '#c1121f' : '#1b1b1b', fontStyle: 'bold' })
      .setOrigin(0.5);
    return this.add2(this.add.container(x, y, [g, t]).setSize(w, h));
  }

  /** 牌组竖着叠成一列，多组从左往右（或从右往左）排 */
  private drawMelds(melds: (Meld | Group)[], x: number, y: number, dir: 1 | -1) {
    const { w, h } = SIZES.S;
    melds.forEach((m, i) => {
      const cx = x + dir * i * (w + 4);
      m.cards.forEach((c, j) => this.card(cx, y + j * (h - 12), c, 'S'));
      const label = 'type' in m ? EVENT_TEXT[m.type] : undefined;
      if (label) this.add2(text(this, cx, y - h / 2 - 12, label, 14, '#b7e4c7'));
    });
  }

  private drawDiscards(cards: number[], x: number, y: number, dir: 1 | -1) {
    const { w, h } = SIZES.S;
    cards.forEach((c, i) => this.card(x + dir * (i % 10) * (w + 2), y + Math.floor(i / 10) * (h + 2), c, 'S'));
  }

  private seatName(v: ZipaiView, seat: number) {
    return seat === v.mySeat ? '你' : v.players[seat]!.nickname;
  }

  private drawOpponent(v: ZipaiView, seat: number) {
    const p = v.players[seat]!;
    const right = SEAT_SIDE[seat] === 'right';
    const x = right ? W - 40 : 40;
    const dir = right ? -1 : 1;
    const origin = right ? 1 : 0;
    const waiting = v.waitingSeat === seat;
    this.add2(
      text(this, x, 100, `${seat === v.dealer ? '【庄】' : ''}${p.nickname}`, 24, waiting ? '#ffd166' : '#ffffff').setOrigin(origin, 0.5),
    );
    this.add2(text(this, x, 130, `手牌 ${p.handCount} 张 · 胡息 ${p.visibleHuxi}`, 18, '#d8f3dc').setOrigin(origin, 0.5));
    this.drawMelds(p.melds, x + dir * 15, 185, dir);
    this.drawDiscards(p.discards, x + dir * 15, 330, dir);
  }

  private drawMe(v: ZipaiView) {
    const me = v.players[v.mySeat]!;
    this.add2(
      text(this, 40, 420, `${v.mySeat === v.dealer ? '【庄】' : ''}你 · 胡息 ${me.visibleHuxi}`, 20, v.waitingSeat === v.mySeat ? '#ffd166' : '#ffffff').setOrigin(0, 0.5),
    );
    this.drawMelds(me.melds, 55, 470, 1);
    this.add2(text(this, W - 40, 420, '我的弃牌', 16, '#b7e4c7').setOrigin(1, 0.5));
    this.drawDiscards(me.discards, W - 55, 455, -1);

    // 手牌：坎（三张相同）不能打，调暗显示
    const counts = toCounts(v.hand);
    const canDiscard = new Set(v.options.flatMap((o) => (o.type === 'discard' ? [o.card] : [])));
    const { w } = SIZES.M;
    const gap = 2;
    const startX = W / 2 - ((v.hand.length - 1) * (w + gap)) / 2;
    let raisedOnce = false;
    v.hand.forEach((c, i) => {
      const raised = this.selected === c && !raisedOnce;
      if (raised) raisedOnce = true;
      const obj = this.card(startX + i * (w + gap), raised ? 628 : 648, c, 'M', { dim: counts[c] === 3 });
      if (canDiscard.has(c)) {
        obj.setInteractive({ useHandCursor: true }).on('pointerup', () => this.onHandCard(c));
      }
    });
    if (canDiscard.size) {
      this.add2(text(this, W / 2, 580, this.selected ? '再点一次出牌' : '轮到你出牌：点一张牌', 22, '#ffd166'));
    }
  }

  private onHandCard(c: number) {
    if (this.selected === c) {
      this.selected = null;
      this.sendAction({ type: 'discard', card: c });
    } else {
      this.selected = c;
      this.render(this.view!);
    }
  }

  private drawTable(v: ZipaiView) {
    if (!v.table) return;
    const { card, from, source } = v.table;
    this.card(W / 2, 250, card, 'L');
    this.add2(text(this, W / 2, 180, `${this.seatName(v, from)} ${source === 'draw' ? '翻牌' : '出牌'}`, 22, '#d8f3dc'));
  }

  private drawOptions(v: ZipaiView) {
    const opts = v.options.filter((o) => o.type !== 'discard');
    if (!opts.length || !v.table) return;
    const labelOf = (o: ZipaiAction) => {
      if (o.type === 'hu') return '胡';
      if (o.type === 'peng') return '碰';
      if (o.type === 'pass') return '过';
      if (o.type === 'chi') return `吃 ${[...o.cards, v.table!.card].sort((a, b) => a - b).map(cardName).join('')}`;
      return '';
    };
    const colorOf = (o: ZipaiAction) => (o.type === 'hu' ? 0xe63946 : o.type === 'pass' ? 0x6c757d : 0xf4a261);
    const widths = opts.map((o) => (o.type === 'chi' ? 150 : 100));
    const total = widths.reduce((a, b) => a + b, 0) + (opts.length - 1) * 16;
    let x = W / 2 - total / 2;
    opts.forEach((o, i) => {
      const w = widths[i]!;
      this.add2(button(this, x + w / 2, 380, labelOf(o), () => this.sendAction(o), { width: w, height: 56, color: colorOf(o), fontSize: 24 }));
      x += w + 16;
    });
  }

  private placeTimer(v: ZipaiView) {
    if (v.waitingSeat === null) return;
    const side = SEAT_SIDE[v.waitingSeat];
    if (side === 'bottom') this.timerText.setPosition(W / 2 + 200, 580);
    else if (side === 'right') this.timerText.setPosition(W - 60, 70);
    else this.timerText.setPosition(60, 70);
  }

  /** 吃/碰/偎/提/跑/胡 在对应座位旁飘字 */
  private showNewEvents(v: ZipaiView) {
    for (const e of v.events) {
      if (e.id <= this.lastEventId) continue;
      this.lastEventId = e.id;
      const label = EVENT_TEXT[e.type];
      if (!label) continue;
      const side = SEAT_SIDE[e.seat];
      const [x, y] = side === 'bottom' ? [W / 2, 520] : side === 'right' ? [W - 220, 150] : [220, 150];
      const t = text(this, x, y, `${this.seatName(v, e.seat)} ${label}！`, 44, '#ffd166').setDepth(80).setStroke('#5c3d00', 6);
      this.tweens.add({ targets: t, y: y - 40, alpha: 0, delay: 700, duration: 600, onComplete: () => t.destroy() });
    }
  }

  private drawResult(v: ZipaiView) {
    const r = v.result!;
    this.add2(this.add.rectangle(0, 0, W, H, 0x000000, 0.6).setOrigin(0).setInteractive());
    const panel = this.add.graphics();
    panel.fillStyle(0x10281c, 0.97).fillRoundedRect(W / 2 - 420, 110, 840, 500, 18);
    panel.lineStyle(3, 0xe9c46a).strokeRoundedRect(W / 2 - 420, 110, 840, 500, 18);
    this.add2(panel);

    const title = r.winner === null ? '荒庄（没人胡）' : r.winner === v.mySeat ? '你胡了！' : `${v.players[r.winner]!.nickname} 胡了`;
    this.add2(text(this, W / 2, 160, title, 44, r.winner === v.mySeat ? '#ffd166' : '#ffffff'));
    if (r.winner !== null) {
      this.add2(text(this, W / 2, 215, `${r.huxi} 胡息 · ${r.tun} 囤`, 26, '#d8f3dc'));
      this.drawMelds([...r.winnerMelds, ...r.winnerHand], W / 2 - ((r.winnerMelds.length + r.winnerHand.length - 1) * 34) / 2, 290, 1);
    }
    const delta = r.coinsDelta;
    this.add2(text(this, W / 2, 440, delta === 0 ? '金币不变' : `金币 ${delta > 0 ? '+' : ''}${delta}`, 34, delta >= 0 ? '#ffd166' : '#ff8fa3'));

    this.add2(button(this, W / 2 - 130, 540, '再来一局', () => this.nextRound(), { width: 200, color: 0x2a9d8f }));
    this.add2(button(this, W / 2 + 130, 540, '返回大厅', () => this.scene.start('Lobby'), { width: 200, color: 0x6c757d }));
  }

  // ---------- 操作 ----------

  private sendAction(action: ZipaiAction) {
    net.request('zipai.action', { action }).catch((e) => {
      if (e instanceof NetError && e.code !== 'DISCONNECTED') toast(this, errorText(e.code));
    });
  }

  private nextRound() {
    if (session.coins < ZIPAI_RULES.minCoins) {
      toast(this, `至少需要 ${ZIPAI_RULES.minCoins} 金币`);
      return;
    }
    net
      .request('zipai.next', {})
      .then((v) => this.render(v))
      .catch((e) => toast(this, errorText(e instanceof NetError ? e.code : 'INTERNAL')));
  }
}
