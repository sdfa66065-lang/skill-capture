import Phaser from 'phaser';
import {
  LYCHEE_ID,
  LYCHEE_LINES,
  LYCHEE_LINE_BETS,
  LYCHEE_SYMBOLS,
  lycheeTotalBet,
  type LycheeOutcome,
} from '@game/shared';
import { net, NetError } from '../net.ts';
import { session } from '../session.ts';
import { chiptune, sfx } from '../sound.ts';
import { button, errorText, text, toast } from '../ui.ts';

const W = 1280;
const H = 720;
const CELL_W = 180;
const CELL_H = 120;
const GAP = 10;
/** 转动最短时长；三列依次停下 */
const SPIN_MS = 700;
const COLUMN_STOP_GAP_MS = 250;

const cellX = (i: number) => W / 2 + ((i % 3) - 1) * (CELL_W + GAP);
const cellY = (i: number) => 305 + (Math.floor(i / 3) - 1) * (CELL_H + GAP);

/**
 * 九个荔枝：点「开始」→ 服务端开奖 → 九格滚动后按列停下 → 高亮中奖线。
 * 结果完全来自服务端，客户端只负责动画。
 */
export class LycheeScene extends Phaser.Scene {
  private cells: Phaser.GameObjects.Image[] = [];
  private betIndex = 0;
  private spinning = false;
  private auto = false;
  private effects!: Phaser.GameObjects.Container;
  private betText!: Phaser.GameObjects.Text;
  private winText!: Phaser.GameObjects.Text;
  private autoButton!: Phaser.GameObjects.Container;
  private spinButton!: Phaser.GameObjects.Container;
  /** 停止滚动音效；没在滚动时为 null */
  private stopRollSound: (() => void) | null = null;

  constructor() {
    super('Lychee');
  }

  create() {
    this.spinning = false;
    this.auto = false;
    this.cells = [];

    this.drawBackground();
    this.drawMachine();
    this.effects = this.add.container(0, 0).setDepth(20);
    this.createControls();

    this.input.keyboard?.on('keydown-SPACE', () => this.spin());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.auto = false;
      this.stopRollSound?.();
      this.stopRollSound = null;
      this.input.keyboard?.removeAllListeners();
    });
  }

  // ---------- 画面 ----------

  private drawBackground() {
    this.add.rectangle(0, 0, W, H, 0x05010f).setOrigin(0);
    for (let i = 0; i < 70; i++) {
      const star = this.add.circle(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H), Phaser.Math.FloatBetween(0.8, 2.2), 0xffffff);
      this.tweens.add({
        targets: star,
        alpha: { from: Phaser.Math.FloatBetween(0.1, 0.4), to: 1 },
        duration: Phaser.Math.Between(600, 1800),
        yoyo: true,
        repeat: -1,
        delay: Phaser.Math.Between(0, 1500),
      });
    }
    const title = text(this, W / 2, 48, '九 个 荔 枝', 54, '#f8d7ff').setStroke('#7b2cbf', 8);
    this.tweens.add({ targets: title, scale: 1.05, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private drawMachine() {
    const g = this.add.graphics();
    const left = cellX(0) - CELL_W / 2 - 14;
    const top = cellY(0) - CELL_H / 2 - 14;
    const w = CELL_W * 3 + GAP * 2 + 28;
    const h = CELL_H * 3 + GAP * 2 + 28;
    g.fillStyle(0x3ddc84).fillRoundedRect(left, top, w, h, 10);
    g.fillStyle(0x7b1e4d).fillRoundedRect(left + 6, top + 6, w - 12, h - 12, 8);
    for (let i = 0; i < 9; i++) {
      const x = cellX(i) - CELL_W / 2;
      const y = cellY(i) - CELL_H / 2;
      g.fillStyle(0xff4fa3).fillRect(x - 3, y - 3, CELL_W + 6, CELL_H + 6);
      g.fillStyle(0xd9b3ef).fillRect(x, y, CELL_W, CELL_H);
      this.cells.push(this.add.image(cellX(i), cellY(i), `lychee${LYCHEE_ID}`).setDepth(5));
    }
  }

  private createControls() {
    const y = H - 62;
    this.add.rectangle(0, H - 124, W, 124, 0x12002a, 0.9).setOrigin(0);

    this.add.image(60, y, 'coin');
    const coins = text(this, 84, y, String(session.coins), 30, '#ffd700').setOrigin(0, 0.5);
    const onCoins = (c: number) => coins.setText(String(c));
    session.on('coins', onCoins);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => session.off('coins', onCoins));

    button(this, 330, y, '－', () => this.changeBet(-1), { width: 56, height: 52, fontSize: 30, color: 0x7b2cbf });
    button(this, 560, y, '＋', () => this.changeBet(1), { width: 56, height: 52, fontSize: 30, color: 0x7b2cbf });
    this.betText = text(this, 445, y, '', 22, '#f8d7ff');
    this.changeBet(0);

    this.spinButton = button(this, 760, y, '开 始', () => this.spin(), { width: 200, height: 76, fontSize: 34, color: 0xd00000 });
    this.autoButton = button(this, 960, y, '自动：关', () => this.toggleAuto(), { width: 150, height: 56, fontSize: 22, color: 0x495057 });
    button(this, 1140, y, '赔率表', () => this.showPaytable(), { width: 140, height: 56, fontSize: 22, color: 0x495057 });
    button(this, 90, 40, '← 大厅', () => this.scene.start('Lobby'), { width: 140, height: 50, fontSize: 22 });
    const muteButton = button(this, W - 70, 40, chiptune.muted ? '🔇 静音' : '🔊 声音', () => {
      chiptune.setMuted(!chiptune.muted);
      (muteButton.getAt(1) as Phaser.GameObjects.Text).setText(chiptune.muted ? '🔇 静音' : '🔊 声音');
      sfx.click();
    }, { width: 120, height: 50, fontSize: 20, color: 0x495057 });

    this.winText = text(this, W / 2, 552, '', 34, '#ffd60a').setStroke('#6a040f', 6).setDepth(30);
  }

  private changeBet(delta: number) {
    if (this.spinning) return;
    this.betIndex = Phaser.Math.Clamp(this.betIndex + delta, 0, LYCHEE_LINE_BETS.length - 1);
    if (delta) sfx.click();
    const lineBet = LYCHEE_LINE_BETS[this.betIndex]!;
    this.betText.setText(`单线 ${lineBet}\n总押 ${lycheeTotalBet(lineBet)}`).setAlign('center');
  }

  private toggleAuto() {
    this.auto = !this.auto;
    const label = this.autoButton.getAt(1) as Phaser.GameObjects.Text;
    label.setText(this.auto ? '自动：开' : '自动：关');
    if (this.auto) this.spin();
  }

  // ---------- 转动 ----------

  private async spin() {
    if (this.spinning) return;
    const lineBet = LYCHEE_LINE_BETS[this.betIndex]!;
    if (session.coins < lycheeTotalBet(lineBet)) {
      this.stopAuto();
      sfx.error();
      toast(this, errorText('INSUFFICIENT_COINS'));
      return;
    }
    this.spinning = true;
    this.spinButton.setAlpha(0.5);
    this.effects.removeAll(true);
    this.winText.setText('');

    // 先扣掉显示的余额，开奖结果回来后以服务端为准
    session.setCoins(session.coins - lycheeTotalBet(lineBet));
    sfx.coin();
    this.stopRollSound = sfx.rolling();
    const rolling = this.startRolling();
    try {
      const [result] = await Promise.all([net.request('lychee.spin', { lineBet }), this.wait(SPIN_MS)]);
      await this.stopRolling(rolling, result.grid);
      session.setCoins(result.coins);
      await this.present(result);
    } catch (e) {
      rolling.forEach((t) => t.remove());
      this.stopAuto();
      sfx.error();
      toast(this, errorText(e instanceof NetError ? e.code : 'INTERNAL'));
      // 失败时恢复显示余额（下一次服务端推送/返回也会校正）
      session.setCoins(session.coins + lycheeTotalBet(lineBet));
    } finally {
      this.stopRollSound?.();
      this.stopRollSound = null;
      this.spinning = false;
      this.spinButton.setAlpha(1);
    }
    if (this.auto && this.scene.isActive()) this.time.delayedCall(400, () => this.spin());
  }

  private stopAuto() {
    if (this.auto) this.toggleAuto();
  }

  /** 每格快速切换随机符号，返回各格的定时器 */
  private startRolling(): Phaser.Time.TimerEvent[] {
    return this.cells.map((cell) =>
      this.time.addEvent({
        delay: 55,
        loop: true,
        callback: () => {
          cell.setTexture(`lychee${Phaser.Math.Between(0, LYCHEE_SYMBOLS.length - 1)}`);
          cell.y = cellY(this.cells.indexOf(cell)) + Phaser.Math.Between(-6, 6);
        },
      }),
    );
  }

  /** 从左到右一列一列停下 */
  private async stopRolling(timers: Phaser.Time.TimerEvent[], grid: number[]) {
    for (let col = 0; col < 3; col++) {
      if (col > 0) await this.wait(COLUMN_STOP_GAP_MS);
      if (col === 2) {
        this.stopRollSound?.();
        this.stopRollSound = null;
      }
      sfx.reelStop(col);
      for (let row = 0; row < 3; row++) {
        const i = row * 3 + col;
        timers[i]!.remove();
        const cell = this.cells[i]!;
        cell.setTexture(`lychee${grid[i]}`);
        cell.y = cellY(i) - 14;
        this.tweens.add({ targets: cell, y: cellY(i), duration: 180, ease: 'Back.easeOut' });
      }
    }
    await this.wait(200);
  }

  private async present(r: LycheeOutcome) {
    if (r.fullScreen !== null) return this.presentFullScreen(r);
    if (!r.win) return;
    sfx.win(r.lines.length);

    const g = this.add.graphics();
    this.effects.add(g);
    for (const { line } of r.lines) {
      const [a, , c] = LYCHEE_LINES[line]!;
      g.lineStyle(10, 0xffd60a, 0.9).lineBetween(cellX(a), cellY(a), cellX(c), cellY(c));
      for (const i of LYCHEE_LINES[line]!) {
        this.tweens.add({ targets: this.cells[i]!, scale: 1.12, duration: 160, yoyo: true, repeat: 2 });
      }
    }
    this.tweens.add({ targets: g, alpha: 0.3, duration: 250, yoyo: true, repeat: 3 });
    this.winText.setText(`${r.lines.length} 条线 · 赢 ${r.win}`);
    await this.wait(r.lines.length > 1 ? 1400 : 1000);
  }

  private async presentFullScreen(r: LycheeOutcome) {
    const sym = LYCHEE_SYMBOLS[r.fullScreen!]!;
    const isLychee = sym.id === LYCHEE_ID;
    sfx.jackpot(isLychee);
    for (const cell of this.cells) {
      this.tweens.add({ targets: cell, scale: 1.15, duration: 200, yoyo: true, repeat: 7 });
    }
    const flash = this.add.rectangle(0, 0, W, H, isLychee ? 0xff4fa3 : 0xffd60a, 0.35).setOrigin(0);
    this.effects.add(flash);
    this.tweens.add({ targets: flash, alpha: 0, duration: 220, yoyo: true, repeat: 7 });

    const title = text(this, W / 2, 305, isLychee ? '九个荔枝！！' : `全屏${sym.name}！`, isLychee ? 96 : 72, '#fff3b0')
      .setStroke('#9d0208', 10)
      .setScale(0.2);
    this.effects.add(title);
    this.tweens.add({ targets: title, scale: 1, duration: 500, ease: 'Back.easeOut' });

    for (let i = 0; i < 40; i++) {
      const coin = this.add.image(Phaser.Math.Between(200, W - 200), -30, 'coin');
      this.effects.add(coin);
      this.tweens.add({
        targets: coin,
        y: H + 40,
        angle: 360,
        delay: Phaser.Math.Between(0, 1500),
        duration: Phaser.Math.Between(900, 1600),
      });
    }
    this.winText.setText(`全屏 ×${sym.fullPay} · 赢 ${r.win}`);
    await this.wait(3200);
    title.destroy();
  }

  private showPaytable() {
    const layer = this.add.container(0, 0).setDepth(100);
    const shade = this.add.rectangle(0, 0, W, H, 0x000000, 0.75).setOrigin(0).setInteractive();
    shade.on('pointerup', () => layer.destroy());
    layer.add(shade);
    const panel = this.add.graphics();
    panel.fillStyle(0x240046).fillRoundedRect(W / 2 - 360, 90, 720, 560, 16);
    panel.lineStyle(3, 0xff4fa3).strokeRoundedRect(W / 2 - 360, 90, 720, 560, 16);
    layer.add(panel);
    layer.add(text(this, W / 2, 125, '赔率表（点任意处关闭）', 26, '#f8d7ff'));
    layer.add(text(this, W / 2 + 40, 165, '一条线三连（× 单线押注）', 18, '#c8b6ff'));
    layer.add(text(this, W / 2 + 250, 165, '全屏（× 总押注）', 18, '#c8b6ff'));
    [...LYCHEE_SYMBOLS].reverse().forEach((s, i) => {
      const y = 215 + i * 60;
      layer.add(this.add.image(W / 2 - 250, y, `lychee${s.id}`).setScale(0.5));
      layer.add(text(this, W / 2 - 150, y, s.name, 24).setOrigin(0, 0.5));
      layer.add(text(this, W / 2 + 40, y, `×${s.linePay}`, 26, '#ffd60a'));
      layer.add(text(this, W / 2 + 250, y, `×${s.fullPay}`, 26, s.id === LYCHEE_ID ? '#ff4fa3' : '#ffd60a'));
    });
    layer.add(text(this, W / 2, 628, '8 条线：3 横 3 竖 2 斜，每次押全部 8 条线', 18, '#c8b6ff'));
  }

  private wait(ms: number) {
    return new Promise<void>((resolve) => this.time.delayedCall(ms, resolve));
  }
}
