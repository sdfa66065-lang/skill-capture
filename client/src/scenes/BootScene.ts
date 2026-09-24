import Phaser from 'phaser';
import { net, NetError } from '../net.ts';
import { getDeviceId, session } from '../session.ts';
import { createTextures, loadArt } from '../textures.ts';
import { button, errorText, text } from '../ui.ts';

/** 加载素材 → 生成贴图 → 连接服务器 → 游客登录 → 进大厅 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    loadArt(this);
  }

  create() {
    createTextures(this);
    net.onClose(() => this.showDisconnected());
    void this.login();
  }

  private async login() {
    const { width, height } = this.scale;
    const status = text(this, width / 2, height / 2, '连接中…', 32);
    try {
      await net.connect();
      await net.syncTime();
      const { user } = await net.request('login', { deviceId: getDeviceId() });
      session.user = user;
      this.scene.start('Lobby');
    } catch (e) {
      status.setText(e instanceof NetError ? errorText(e.code) : '连接失败');
      button(this, width / 2, height / 2 + 90, '重试', () => location.reload());
    }
  }

  /** 断线后覆盖在当前场景上，点一下重新加载 */
  private showDisconnected() {
    const top = this.game.scene.getScenes(true)[0];
    if (!top) return;
    const { width, height } = top.scale;
    top.add.rectangle(0, 0, width, height, 0x000000, 0.75).setOrigin(0).setDepth(2000).setInteractive();
    text(top, width / 2, height / 2 - 40, '与服务器的连接已断开', 32).setDepth(2001);
    button(top, width / 2, height / 2 + 50, '重新连接', () => location.reload()).setDepth(2001);
  }
}
