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
