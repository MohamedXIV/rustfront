import Phaser from 'phaser';

/** Foundation scene. Confirms that Phaser boots and scales. Replaced by real menus in later stages. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2 - 24, 'RUSTFRONT', {
        fontFamily: 'monospace',
        fontSize: '48px',
        color: '#e8d9b5',
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height / 2 + 28, 'Foundation build. Gameplay not yet implemented.', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#8a7f6e',
      })
      .setOrigin(0.5);
  }
}
