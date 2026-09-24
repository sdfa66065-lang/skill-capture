import Phaser from 'phaser';
import { WORLD_H, WORLD_W } from '@game/shared';
import { BootScene } from './scenes/BootScene.ts';
import { FishScene } from './scenes/FishScene.ts';
import { LobbyScene } from './scenes/LobbyScene.ts';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#04121f',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: WORLD_W,
    height: WORLD_H,
  },
  scene: [BootScene, LobbyScene, FishScene],
});
