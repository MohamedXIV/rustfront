import { describe, expect, it } from 'vitest';
import { getUnit } from '../shared/data';
import { cellOf, createMatch, spawnEntity, stepBattle } from '../shared/sim';
import type { Vec2 } from '../shared/sim/geometry';

describe('fairness', () => {
  it('mirrored first contact fires on the same tick for both sides', () => {
    const range = getUnit('medium_tank').weapon!.range;

    // Sweep the starting gap so the range threshold is crossed at every phase of the movement step.
    for (let k = 0; k < 20; k++) {
      const state = createMatch(7);
      const half = (range + 1 + k * 0.04) / 2;
      // Mirrored about the arena's vertical centre line (x = 32).
      const redPos: Vec2 = { x: 32 - half, y: 19.5 };
      const bluePos: Vec2 = { x: 32 + half, y: 19.5 };

      const red = spawnEntity(state, { team: 'red', defId: 'medium_tank', kind: 'unit', origin: cellOf(redPos), pos: redPos });
      const blue = spawnEntity(state, { team: 'blue', defId: 'medium_tank', kind: 'unit', origin: cellOf(bluePos), pos: bluePos });

      let fired = false;
      for (let i = 0; i < 300 && !fired; i++) {
        stepBattle(state);
        fired = red.cooldownMs > 0 || blue.cooldownMs > 0;
      }

      expect(fired, `gap case ${k}`).toBe(true);
      // Mirrored units must answer each other on the same tick, whichever side moved into range first.
      expect(red.cooldownMs > 0, `red fired, gap case ${k}`).toBe(true);
      expect(blue.cooldownMs > 0, `blue fired, gap case ${k}`).toBe(true);
    }
  });
});
