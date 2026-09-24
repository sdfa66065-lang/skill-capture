import Phaser from 'phaser';
import { RELIEF_THRESHOLD } from '@game/shared';
import { net, NetError } from '../net.ts';
import { session } from '../session.ts';
import { button, errorText, text, toast } from '../ui.ts';

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super('Lobby');
  }

  create() {
    const { width, height } = this.scale;
    this.drawBackground();

    const user = session.user!;
    text(this, 40, 40, user.nickname, 26).setOrigin(0, 0.5);
    this.add.image(width - 260, 40, 'coin');
    const coins = text(this, width - 236, 40, String(user.coins), 30, '#ffd700').setOrigin(0, 0.5);
    const onCoins = (c: number) => {
      coins.setText(String(c));
      relief.setVisible(c < RELIEF_THRESHOLD);
    };
    session.on('coins', onCoins);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => session.off('coins', onCoins));

    text(this, width / 2, 150, '游戏大厅', 56);

    const cardY = height / 2 + 30;
    button(this, width / 2 - 320, cardY, '🐟 捕鱼', () => this.scene.start('Fish'), {
      width: 260, height: 200, color: 0x1d7874, fontSize: 36,
    });
    button(this, width / 2, cardY, '大字牌\n敬请期待', () => {}, {
      width: 260, height: 200, fontSize: 30, disabled: true,
    });
    button(this, width / 2 + 320, cardY, '九个荔枝\n敬请期待', () => {}, {
      width: 260, height: 200, fontSize: 30, disabled: true,
    });

    const relief = button(this, width / 2, height - 90, '领取救济金', () => void this.claimRelief(), {
      width: 260, color: 0xe76f51,
    }).setVisible(user.coins < RELIEF_THRESHOLD);
  }

  private async claimRelief() {
    try {
      const { coins, remainingToday } = await net.request('relief', {});
      session.setCoins(coins);
      toast(this, `领取成功，今天还可领 ${remainingToday} 次`);
    } catch (e) {
      toast(this, errorText(e instanceof NetError ? e.code : 'INTERNAL'));
    }
  }

  private drawBackground() {
    const { width, height } = this.scale;
    const g = this.add.graphics();
    g.fillGradientStyle(0x0b3d5c, 0x0b3d5c, 0x04121f, 0x04121f, 1);
    g.fillRect(0, 0, width, height);
  }
}
