import Phaser from 'phaser';
import type { UserInfo } from '@game/shared';

/** 当前登录用户；金币变化时发出 'coins' 事件 */
class Session extends Phaser.Events.EventEmitter {
  user: UserInfo | null = null;

  get coins(): number {
    return this.user?.coins ?? 0;
  }

  setCoins(coins: number) {
    if (!this.user || this.user.coins === coins) return;
    this.user.coins = coins;
    this.emit('coins', coins);
  }
}

export const session = new Session();

export function getDeviceId(): string {
  const KEY = 'deviceId';
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return saved;
  } catch {
    /* 隐私模式等场景下 localStorage 不可用 */
  }
  const id =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* 同上 */
  }
  return id;
}
