import Phaser from 'phaser';

const FONT = 'monospace';

/** A clickable text button. Disabled buttons are dimmed and do not react to input. */
export function addButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  enabled = true,
): Phaser.GameObjects.Text {
  const text = scene.add
    .text(x, y, label, buttonStyle(enabled))
    .setOrigin(0.5)
    .setDepth(300);
  if (enabled) {
    text.setInteractive({ useHandCursor: true });
    text.on('pointerover', () => text.setColor('#fff4d6'));
    text.on('pointerout', () => text.setColor('#e8d9b5'));
    text.on('pointerdown', onClick);
  }
  return text;
}

function buttonStyle(enabled: boolean): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT,
    fontSize: '18px',
    color: enabled ? '#e8d9b5' : '#6b6255',
    backgroundColor: enabled ? '#3a2f28' : '#211c18',
    padding: { x: 14, y: 8 },
  };
}

/** A short message that fades out. Errors use a warm red so they stand out. */
export function toast(scene: Phaser.Scene, message: string, tone: 'info' | 'error' = 'info'): void {
  const label = scene.add
    .text(480, 58, message, {
      fontFamily: FONT,
      fontSize: '15px',
      color: tone === 'error' ? '#ffb4a2' : '#e8d9b5',
      backgroundColor: '#14110f',
      padding: { x: 12, y: 6 },
    })
    .setOrigin(0.5, 0)
    .setDepth(400);
  scene.tweens.add({
    targets: label,
    alpha: 0,
    delay: 2200,
    duration: 400,
    onComplete: () => label.destroy(),
  });
}

/** Text in the house monospace style. Pass `wrap` to wrap at that width in pixels. */
export function textStyle(
  size: number,
  color: string,
  extra: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {},
): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT, fontSize: `${size}px`, color, ...extra };
}

export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
