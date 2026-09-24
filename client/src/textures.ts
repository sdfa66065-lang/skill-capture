import Phaser from 'phaser';
import { BULLET_RADIUS, FISH_TYPES } from '@game/shared';

/** 用代码画占位美术；换正式素材时只需在 BootScene 里改成 load.image，key 保持不变 */
export function createTextures(scene: Phaser.Scene) {
  const g = scene.make.graphics({}, false);

  for (const f of FISH_TYPES) {
    const r = f.radius;
    const w = r * 3;
    const h = r * 2;
    g.clear();
    // 尾巴
    g.fillStyle(Phaser.Display.Color.ValueToColor(f.color).darken(20).color);
    g.fillTriangle(0, h / 2 - r * 0.7, 0, h / 2 + r * 0.7, r * 0.9, h / 2);
    // 身体
    g.fillStyle(f.color);
    g.fillEllipse(r * 1.8, h / 2, r * 2.4, r * 1.5);
    // 背鳍
    g.fillTriangle(r * 1.4, h / 2 - r * 0.6, r * 2.2, h / 2 - r * 0.6, r * 1.6, h / 2 - r * 1.0);
    // 眼睛
    g.fillStyle(0xffffff);
    g.fillCircle(r * 2.5, h / 2 - r * 0.2, r * 0.22);
    g.fillStyle(0x000000);
    g.fillCircle(r * 2.55, h / 2 - r * 0.2, r * 0.11);
    g.generateTexture(`fish${f.id}`, w, h);
  }

  g.clear();
  g.fillStyle(0xfff3b0);
  g.fillCircle(BULLET_RADIUS, BULLET_RADIUS, BULLET_RADIUS);
  g.fillStyle(0xffffff);
  g.fillCircle(BULLET_RADIUS - 2, BULLET_RADIUS - 2, BULLET_RADIUS / 3);
  g.generateTexture('bullet', BULLET_RADIUS * 2, BULLET_RADIUS * 2);

  // 渔网
  g.clear();
  g.lineStyle(3, 0xffffff, 0.9);
  g.strokeCircle(40, 40, 38);
  for (let i = -30; i <= 30; i += 12) {
    g.lineBetween(40 + i, 4, 40 + i, 76);
    g.lineBetween(4, 40 + i, 76, 40 + i);
  }
  g.generateTexture('net', 80, 80);

  // 炮台底座与炮管
  g.clear();
  g.fillStyle(0x264653);
  g.fillCircle(50, 50, 50);
  g.lineStyle(4, 0xe9c46a);
  g.strokeCircle(50, 50, 46);
  g.generateTexture('cannonBase', 100, 100);
  g.clear();
  g.fillStyle(0xe9c46a);
  g.fillRoundedRect(0, 0, 80, 28, 8);
  g.fillStyle(0xf4a261);
  g.fillRect(64, 0, 16, 28);
  g.generateTexture('cannonBarrel', 80, 28);

  g.clear();
  g.fillStyle(0xffd700);
  g.fillCircle(14, 14, 14);
  g.lineStyle(3, 0xb8860b);
  g.strokeCircle(14, 14, 11);
  g.generateTexture('coin', 28, 28);

  g.destroy();
}

export const LYCHEE_TEX_W = 120;
export const LYCHEE_TEX_H = 96;

/** 九个荔枝的 7 种符号（下标与 LYCHEE_SYMBOLS 的 id 对应），key 为 lychee0..lychee6 */
export function createLycheeTextures(scene: Phaser.Scene) {
  const W = LYCHEE_TEX_W;
  const H = LYCHEE_TEX_H;
  const cx = W / 2;
  const cy = H / 2;
  const g = scene.make.graphics({}, false);
  const draw: ((g: Phaser.GameObjects.Graphics) => void)[] = [
    // 樱桃
    (g) => {
      g.lineStyle(4, 0x2d6a4f);
      g.lineBetween(cx - 16, cy + 10, cx + 4, cy - 30);
      g.lineBetween(cx + 18, cy + 12, cx + 4, cy - 30);
      g.fillStyle(0x52b788).fillEllipse(cx + 16, cy - 30, 26, 12);
      g.fillStyle(0xd00000).fillCircle(cx - 16, cy + 18, 17).fillCircle(cx + 18, cy + 20, 17);
      g.fillStyle(0xffffff, 0.6).fillCircle(cx - 22, cy + 12, 5).fillCircle(cx + 12, cy + 14, 5);
    },
    // 橙子
    (g) => {
      g.fillStyle(0xf77f00).fillCircle(cx, cy + 4, 32);
      g.fillStyle(0xfcbf49, 0.7).fillCircle(cx - 10, cy - 6, 10);
      g.fillStyle(0x2d6a4f).fillEllipse(cx + 12, cy - 30, 26, 12);
    },
    // 铃铛
    (g) => {
      g.fillStyle(0xffc300);
      g.fillCircle(cx, cy - 14, 22);
      g.fillTriangle(cx - 22, cy - 14, cx + 22, cy - 14, cx + 34, cy + 22);
      g.fillTriangle(cx - 22, cy - 14, cx - 34, cy + 22, cx + 34, cy + 22);
      g.fillStyle(0xb8860b).fillRect(cx - 36, cy + 20, 72, 8);
      g.fillStyle(0x7f5539).fillCircle(cx, cy + 32, 7);
      g.fillStyle(0xfff3b0, 0.8).fillEllipse(cx - 10, cy - 18, 8, 18);
    },
    // 西瓜（半块）
    (g) => {
      g.fillStyle(0x2d6a4f).beginPath().slice(cx, cy - 12, 46, 0, Math.PI, false).fillPath();
      g.fillStyle(0xb7e4c7).beginPath().slice(cx, cy - 12, 40, 0, Math.PI, false).fillPath();
      g.fillStyle(0xe63946).beginPath().slice(cx, cy - 12, 36, 0, Math.PI, false).fillPath();
      g.fillStyle(0x111111);
      for (const [dx, dy] of [[-18, 4], [0, 10], [18, 4], [-8, 20], [10, 20]]) g.fillEllipse(cx + dx!, cy - 12 + dy!, 4, 7);
    },
    // 星星
    (g) => {
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 16 : 40;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push(new Phaser.Math.Vector2(cx + Math.cos(a) * r, cy + 4 + Math.sin(a) * r));
      }
      g.fillStyle(0xffd60a).fillPoints(pts, true);
      g.lineStyle(3, 0xe85d04).strokePoints(pts, true);
    },
    // 七
    (g) => {
      const pts = [[-26, -34], [28, -34], [28, -22], [2, 38], [-14, 38], [10, -20], [-26, -20]].map(
        ([x, y]) => new Phaser.Math.Vector2(cx + x!, cy + y!),
      );
      g.fillStyle(0xd00000).fillPoints(pts, true);
      g.lineStyle(4, 0xffd60a).strokePoints(pts, true);
    },
    // 荔枝：一串红色带疙瘩的果子 + 叶子
    (g) => {
      g.fillStyle(0x38b000).fillEllipse(cx + 22, cy - 22, 44, 26);
      g.lineStyle(2, 0x006400).lineBetween(cx + 2, cy - 22, cx + 42, cy - 22);
      g.lineStyle(3, 0x7f5539).lineBetween(cx - 4, cy - 30, cx + 4, cy - 8);
      for (const [dx, dy, r] of [[-22, 10, 18], [2, 18, 19], [-4, -6, 16]] as const) {
        g.fillStyle(0xc9184a).fillCircle(cx + dx, cy + dy, r);
        g.fillStyle(0x800f2f);
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3;
          g.fillCircle(cx + dx + Math.cos(a) * r * 0.55, cy + dy + Math.sin(a) * r * 0.55, 2.5);
        }
        g.fillStyle(0xffffff, 0.35).fillCircle(cx + dx - r * 0.35, cy + dy - r * 0.35, r * 0.25);
      }
    },
  ];
  draw.forEach((fn, id) => {
    g.clear();
    fn(g);
    g.generateTexture(`lychee${id}`, W, H);
  });
  g.destroy();
}
