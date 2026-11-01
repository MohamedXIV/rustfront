import Phaser from 'phaser';
import { LocalBattle } from '../game/localBattle';
import { PALETTE } from '../render/draw';
import { connectSession } from '../net/session';
import { addButton, messageOf, textStyle } from '../ui/widgets';

/**
 * Routes the page. Connects to the server and opens the lobby. With ?demo it skips the server and
 * starts an offline match against a bot. Optional: ?seed=N for a fixed match, ?speed=N to run faster.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.bg);
    this.add.text(480, 240, 'RUSTFRONT', textStyle(48, '#e8d9b5')).setOrigin(0.5);

    const params = new URLSearchParams(window.location.search);
    if (params.has('demo')) {
      this.startDemo(params);
      return;
    }

    const status = this.add.text(480, 300, 'Connecting to the server...', textStyle(16, '#8a7f6e')).setOrigin(0.5);
    connectSession().then(
      () => this.scene.start('LobbyScene'),
      (err: unknown) => {
        status.setText(`Could not connect: ${messageOf(err)}`).setColor('#ff9c8a');
        addButton(this, 480, 360, 'RETRY', () => this.scene.restart());
      },
    );
  }

  private startDemo(params: URLSearchParams): void {
    const speed = Math.min(50, Math.max(1, Number(params.get('speed')) || 1));
    const seed = Number(params.get('seed')) || randomSeed();
    const make = (s: number) => new LocalBattle(s, speed);
    this.scene.start('BattleScene', { source: make(seed), restart: () => make(randomSeed()) });
  }
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff) + 1;
}
