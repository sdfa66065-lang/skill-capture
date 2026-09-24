import Phaser from 'phaser';
import {
  BULLET_LIFETIME_MS,
  BULLET_RADIUS,
  BULLET_SPEED,
  CANNON_LEVELS,
  CANNON_X,
  CANNON_Y,
  FISH_TYPES,
  MAX_BULLETS,
  WORLD_H,
  WORLD_W,
  fishPosition,
  type FishHitResult,
  type FishState,
} from '@game/shared';
import { net, NetError } from '../net.ts';
import { session } from '../session.ts';
import { button, errorText, text, toast } from '../ui.ts';

/** 按住屏幕时的自动开炮间隔（服务端下限是 MIN_FIRE_INTERVAL_MS） */
const AUTO_FIRE_MS = 160;
const BARREL_LENGTH = 70;

interface Fish {
  state: FishState;
  sprite: Phaser.GameObjects.Container;
}

interface Bullet {
  id: number;
  sprite: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  bornAt: number;
}

/**
 * 捕鱼场景：只做表现。开炮、命中都发给服务端，金币以服务端返回为准。
 */
export class FishScene extends Phaser.Scene {
  private fishes = new Map<number, Fish>();
  private bullets: Bullet[] = [];
  private nextBulletId = 1;
  private levelIndex = 0;
  private firing = false;
  private lastFireAt = 0;
  private barrel!: Phaser.GameObjects.Image;
  private levelText!: Phaser.GameObjects.Text;
  private unsubscribe: (() => void)[] = [];

  constructor() {
    super('Fish');
  }

  create() {
    this.fishes = new Map();
    this.bullets = [];
    this.nextBulletId = 1;
    this.firing = false;

    this.drawBackground();
    this.createHud();
    this.createCannon();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length) return; // 点在按钮上
      this.aimAt(p);
      this.firing = true;
      this.tryFire();
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.aimAt(p));
    this.input.on('pointerup', () => (this.firing = false));
    this.input.on('gameout', () => (this.firing = false));

    this.unsubscribe.push(net.on('fish.spawn', ({ fishes }) => fishes.forEach((f) => this.addFish(f))));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    net
      .request('fish.enter', {})
      .then(({ fishes }) => fishes.forEach((f) => this.addFish(f)))
      .catch((e) => toast(this, errorText(e instanceof NetError ? e.code : 'INTERNAL')));
  }

  private cleanup() {
    this.unsubscribe.forEach((u) => u());
    this.unsubscribe = [];
    this.input.removeAllListeners();
    net.request('fish.leave', {}).catch(() => {});
  }

  update(_time: number, deltaMs: number) {
    const time = this.time.now;
    const now = net.serverNow();
    const dt = deltaMs / 1000;

    for (const [id, fish] of this.fishes) {
      const { state } = fish;
      if (now > state.spawnAt + state.duration) {
        fish.sprite.destroy();
        this.fishes.delete(id);
        continue;
      }
      const { x, y, angle } = fishPosition(state, now);
      fish.sprite.setPosition(x, y);
      const body = fish.sprite.getAt(0) as Phaser.GameObjects.Image;
      body.setRotation(angle);
      // 向左游时上下翻转，避免鱼肚朝上
      body.setFlipY(Math.abs(angle) > Math.PI / 2);
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i]!;
      if (time - b.bornAt > BULLET_LIFETIME_MS) {
        this.removeBullet(i);
        continue;
      }
      this.moveBullet(b, dt);
      const target = this.findHitFish(b);
      if (target) {
        this.removeBullet(i);
        this.onBulletHit(b, target);
      }
    }

    if (this.firing && time - this.lastFireAt >= AUTO_FIRE_MS) this.tryFire();
  }

  // ---------- 鱼 ----------

  private addFish(state: FishState) {
    if (this.fishes.has(state.id)) return;
    const type = FISH_TYPES[state.type]!;
    const body = this.add.image(0, 0, `fish${type.id}`).setOrigin(0.6, 0.5);
    const label = text(this, 0, type.radius + 12, `×${type.multiplier}`, 16, '#ffffffcc');
    const sprite = this.add.container(-1000, -1000, [body, label]).setDepth(1);
    this.fishes.set(state.id, { state, sprite });
  }

  private findHitFish(b: Bullet): Fish | undefined {
    for (const fish of this.fishes.values()) {
      const r = FISH_TYPES[fish.state.type]!.radius + BULLET_RADIUS;
      if (Phaser.Math.Distance.Between(b.sprite.x, b.sprite.y, fish.sprite.x, fish.sprite.y) < r) return fish;
    }
    return undefined;
  }

  // ---------- 炮台与子弹 ----------

  private createCannon() {
    this.add.image(CANNON_X, CANNON_Y + 20, 'cannonBase').setDepth(5);
    this.barrel = this.add.image(CANNON_X, CANNON_Y, 'cannonBarrel').setOrigin(0.15, 0.5).setDepth(6);
    this.barrel.setRotation(-Math.PI / 2);

    const y = WORLD_H - 36;
    button(this, CANNON_X - 150, y, '－', () => this.changeLevel(-1), { width: 56, height: 48, fontSize: 30 }).setDepth(10);
    button(this, CANNON_X + 150, y, '＋', () => this.changeLevel(1), { width: 56, height: 48, fontSize: 30 }).setDepth(10);
    this.levelText = text(this, CANNON_X, CANNON_Y - 70, '', 22, '#ffe8a3').setDepth(10);
    this.changeLevel(0);
  }

  private changeLevel(delta: number) {
    this.levelIndex = Phaser.Math.Wrap(this.levelIndex + delta, 0, CANNON_LEVELS.length);
    this.levelText.setText(`炮倍 ×${CANNON_LEVELS[this.levelIndex]}`);
  }

  private aimAt(p: Phaser.Input.Pointer) {
    const angle = Phaser.Math.Angle.Between(CANNON_X, CANNON_Y, p.worldX, p.worldY);
    // 只允许朝上方 170° 范围内瞄准
    this.barrel.setRotation(Phaser.Math.Clamp(angle, -Math.PI + 0.1, -0.1));
  }

  private tryFire() {
    const level = CANNON_LEVELS[this.levelIndex]!;
    if (this.bullets.length >= MAX_BULLETS) return;
    this.lastFireAt = this.time.now;
    if (session.coins < level) {
      this.firing = false;
      toast(this, errorText('INSUFFICIENT_COINS'));
      return;
    }

    const angle = this.barrel.rotation;
    const id = this.nextBulletId++;
    const sprite = this.add
      .image(CANNON_X + Math.cos(angle) * BARREL_LENGTH, CANNON_Y + Math.sin(angle) * BARREL_LENGTH, 'bullet')
      .setDepth(4);
    const bullet: Bullet = {
      id,
      sprite,
      vx: Math.cos(angle) * BULLET_SPEED,
      vy: Math.sin(angle) * BULLET_SPEED,
      bornAt: this.time.now,
    };
    this.bullets.push(bullet);
    this.tweens.add({ targets: this.barrel, scaleX: 0.85, duration: 50, yoyo: true });

    // 先显示子弹，服务端扣费失败再撤回
    net
      .request('fish.fire', { bulletId: id, level })
      .then(({ coins }) => session.setCoins(coins))
      .catch((e) => {
        const i = this.bullets.indexOf(bullet);
        if (i >= 0) this.removeBullet(i);
        // 偶发的限速只丢掉这一发；其他错误停止连发并提示
        if (!(e instanceof NetError) || e.code === 'RATE_LIMIT' || e.code === 'DISCONNECTED') return;
        this.firing = false;
        if (this.scene.isActive()) toast(this, errorText(e.code));
      });
  }

  /** 直线飞行，碰到屏幕边缘反弹 */
  private moveBullet(b: Bullet, dt: number) {
    let x = b.sprite.x + b.vx * dt;
    let y = b.sprite.y + b.vy * dt;
    if (x < BULLET_RADIUS || x > WORLD_W - BULLET_RADIUS) {
      b.vx = -b.vx;
      x = Phaser.Math.Clamp(x, BULLET_RADIUS, WORLD_W - BULLET_RADIUS);
    }
    if (y < BULLET_RADIUS || y > WORLD_H - BULLET_RADIUS) {
      b.vy = -b.vy;
      y = Phaser.Math.Clamp(y, BULLET_RADIUS, WORLD_H - BULLET_RADIUS);
    }
    b.sprite.setPosition(x, y);
  }

  private removeBullet(index: number) {
    this.bullets[index]!.sprite.destroy();
    this.bullets.splice(index, 1);
  }

  private onBulletHit(b: Bullet, fish: Fish) {
    const net_ = this.add.image(b.sprite.x, b.sprite.y, 'net').setDepth(3).setScale(0.3);
    this.tweens.add({
      targets: net_,
      scale: 1,
      alpha: 0,
      duration: 350,
      onComplete: () => net_.destroy(),
    });

    net
      .request('fish.hit', { bulletId: b.id, fishId: fish.state.id })
      .then((r) => this.onHitResult(r))
      .catch(() => {}); // 开炮失败时子弹在服务端不存在，忽略即可
  }

  private onHitResult(r: FishHitResult) {
    session.setCoins(r.coins);
    if (!r.caught) return;
    const fish = this.fishes.get(r.fishId);
    if (!fish) return;
    this.fishes.delete(r.fishId);

    const { x, y } = fish.sprite;
    this.tweens.add({
      targets: fish.sprite,
      angle: 720,
      scale: 0.2,
      alpha: 0,
      duration: 600,
      onComplete: () => fish.sprite.destroy(),
    });

    const reward = text(this, x, y, `+${r.reward}`, r.reward >= 100 ? 44 : 30, '#ffd700').setDepth(20);
    reward.setStroke('#7a4b00', 5);
    this.tweens.add({ targets: reward, y: y - 70, alpha: 0, delay: 400, duration: 800, onComplete: () => reward.destroy() });

    // 金币飞向左下角余额
    const n = Math.min(8, Math.ceil(r.reward / 10) + 1);
    for (let i = 0; i < n; i++) {
      const coin = this.add.image(x, y, 'coin').setDepth(19);
      this.tweens.add({
        targets: coin,
        x: 60,
        y: WORLD_H - 40,
        delay: 200 + i * 60,
        duration: 600,
        ease: 'Cubic.easeIn',
        onComplete: () => coin.destroy(),
      });
    }
  }

  // ---------- 界面 ----------

  private createHud() {
    button(this, 90, 44, '← 大厅', () => this.scene.start('Lobby'), { width: 140, height: 52, fontSize: 22 }).setDepth(10);

    this.add.rectangle(20, WORLD_H - 40, 260, 52, 0x000000, 0.45).setOrigin(0, 0.5).setDepth(9);
    this.add.image(60, WORLD_H - 40, 'coin').setDepth(10);
    const coins = text(this, 84, WORLD_H - 40, String(session.coins), 28, '#ffd700').setOrigin(0, 0.5).setDepth(10);
    const onCoins = (c: number) => coins.setText(String(c));
    session.on('coins', onCoins);
    this.unsubscribe.push(() => session.off('coins', onCoins));
  }

  private drawBackground() {
    const g = this.add.graphics();
    g.fillGradientStyle(0x1b6ca8, 0x1b6ca8, 0x0a2342, 0x0a2342, 1);
    g.fillRect(0, 0, WORLD_W, WORLD_H);
    // 海底光斑与气泡
    for (let i = 0; i < 25; i++) {
      const bubble = this.add.circle(
        Phaser.Math.Between(0, WORLD_W),
        Phaser.Math.Between(0, WORLD_H),
        Phaser.Math.Between(2, 6),
        0xffffff,
        0.15,
      );
      this.tweens.add({
        targets: bubble,
        y: -20,
        duration: Phaser.Math.Between(6000, 14000),
        repeat: -1,
        onRepeat: () => bubble.setPosition(Phaser.Math.Between(0, WORLD_W), WORLD_H + 20),
      });
    }
  }
}
