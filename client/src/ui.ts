import Phaser from 'phaser';

export const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';

export function text(scene: Phaser.Scene, x: number, y: number, str: string, size = 24, color = '#ffffff') {
  return scene.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color }).setOrigin(0.5);
}

export interface ButtonOptions {
  width?: number;
  height?: number;
  color?: number;
  fontSize?: number;
  disabled?: boolean;
}

/** 圆角矩形按钮 */
export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  { width = 200, height = 64, color = 0x2a9d8f, fontSize = 26, disabled = false }: ButtonOptions = {},
) {
  const bg = scene.add.graphics();
  const draw = (fill: number) => {
    bg.clear();
    bg.fillStyle(disabled ? 0x555555 : fill, 1);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 14);
    bg.lineStyle(2, 0xffffff, disabled ? 0.2 : 0.5);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 14);
  };
  draw(color);
  const label_ = text(scene, 0, 0, label, fontSize, disabled ? '#aaaaaa' : '#ffffff');
  const c = scene.add.container(x, y, [bg, label_]).setSize(width, height);
  if (!disabled) {
    c.setInteractive({ useHandCursor: true })
      .on('pointerover', () => draw(Phaser.Display.Color.ValueToColor(color).brighten(15).color))
      .on('pointerout', () => draw(color))
      .on('pointerdown', () => c.setScale(0.95))
      .on('pointerup', () => {
        c.setScale(1);
        onClick();
      });
  }
  return c;
}

/** 屏幕中央短暂提示 */
export function toast(scene: Phaser.Scene, msg: string) {
  const { width, height } = scene.scale;
  const t = text(scene, width / 2, height / 2 - 120, msg, 28).setDepth(1000);
  const pad = scene.add
    .rectangle(t.x, t.y, t.width + 48, t.height + 24, 0x000000, 0.7)
    .setDepth(999);
  scene.tweens.add({
    targets: [t, pad],
    alpha: 0,
    delay: 1200,
    duration: 400,
    onComplete: () => {
      t.destroy();
      pad.destroy();
    },
  });
}

const ERROR_TEXT: Record<string, string> = {
  INSUFFICIENT_COINS: '金币不足',
  RELIEF_NOT_ELIGIBLE: '金币低于 100 才能领取救济金',
  RELIEF_LIMIT: '今天的救济金已经领完了',
  DISCONNECTED: '网络连接已断开',
  RATE_LIMIT: '操作太快了',
  TOO_MANY_BULLETS: '子弹太多了',
};

export function errorText(code: string): string {
  return ERROR_TEXT[code] ?? `出错了（${code}）`;
}
