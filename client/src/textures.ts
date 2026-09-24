import Phaser from 'phaser';
import { BULLET_RADIUS, FISH_TYPES } from '@game/shared';

/**
 * 美术素材：把 PNG 放进 client/src/art/，文件名 = 贴图 key（如 fish0.png、coin.png）。
 * 有文件就用素材，没有就用下面代码画的占位图。素材会按原比例缩放居中到占位图的尺寸，
 * 所以碰撞半径、锚点等游戏逻辑不用改。规格和 AI 出图提示词见 client/src/art/README.md。
 */
const ART_FILES = import.meta.glob<string>('./art/*.png', { eager: true, query: '?url', import: 'default' });
const ART_PREFIX = 'art:';

/** BootScene.preload 里调用：加载 art/ 目录下已有的素材 */
export function loadArt(scene: Phaser.Scene) {
  for (const [path, url] of Object.entries(ART_FILES)) {
    const key = path.slice('./art/'.length, -'.png'.length);
    scene.load.image(ART_PREFIX + key, url);
  }
}

/** 有素材就缩放进 w×h 的画布并返回 true */
function useArt(scene: Phaser.Scene, key: string, w: number, h: number): boolean {
  const src = ART_PREFIX + key;
  if (!scene.textures.exists(src)) return false;
  const img = scene.textures.get(src).getSourceImage() as HTMLImageElement;
  const canvas = scene.textures.createCanvas(key, w, h)!;
  const ctx = canvas.getContext();
  ctx.imageSmoothingQuality = 'high';
  const s = Math.min(w / img.width, h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  canvas.refresh();
  scene.textures.remove(src);
  return true;
}

/** 生成所有贴图；key 和尺寸是游戏逻辑依赖的约定，换素材时保持不变 */
export function createTextures(scene: Phaser.Scene) {
  const g = scene.make.graphics({}, false);
  const draw = (key: string, w: number, h: number, paint: () => void) => {
    if (useArt(scene, key, w, h)) return;
    g.clear();
    paint();
    g.generateTexture(key, w, h);
  };

  for (const f of FISH_TYPES) {
    const r = f.radius;
    const h = r * 2;
    draw(`fish${f.id}`, r * 3, h, () => {
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
    });
  }

  draw('bullet', BULLET_RADIUS * 2, BULLET_RADIUS * 2, () => {
    g.fillStyle(0xfff3b0);
    g.fillCircle(BULLET_RADIUS, BULLET_RADIUS, BULLET_RADIUS);
    g.fillStyle(0xffffff);
    g.fillCircle(BULLET_RADIUS - 2, BULLET_RADIUS - 2, BULLET_RADIUS / 3);
  });

  // 渔网
  draw('net', 80, 80, () => {
    g.lineStyle(3, 0xffffff, 0.9);
    g.strokeCircle(40, 40, 38);
    for (let i = -30; i <= 30; i += 12) {
      g.lineBetween(40 + i, 4, 40 + i, 76);
      g.lineBetween(4, 40 + i, 76, 40 + i);
    }
  });

  // 炮台底座与炮管
  draw('cannonBase', 100, 100, () => {
    g.fillStyle(0x264653);
    g.fillCircle(50, 50, 50);
    g.lineStyle(4, 0xe9c46a);
    g.strokeCircle(50, 50, 46);
  });
  draw('cannonBarrel', 80, 28, () => {
    g.fillStyle(0xe9c46a);
    g.fillRoundedRect(0, 0, 80, 28, 8);
    g.fillStyle(0xf4a261);
    g.fillRect(64, 0, 16, 28);
  });

  draw('coin', 28, 28, () => {
    g.fillStyle(0xffd700);
    g.fillCircle(14, 14, 14);
    g.lineStyle(3, 0xb8860b);
    g.strokeCircle(14, 14, 11);
  });

  g.destroy();
}
