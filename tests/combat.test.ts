import { describe, expect, it } from 'vitest';
import { armorFacing, damageThroughArmor, penetrationMultiplier } from '../shared/rules/combat';
import type { ArmorSet } from '../shared/types';

describe('penetration table', () => {
  it('matches the DESIGN.md multiplier table', () => {
    expect(penetrationMultiplier('none', 'none')).toBe(1.0);
    expect(penetrationMultiplier('none', 'light')).toBe(0.6);
    expect(penetrationMultiplier('none', 'medium')).toBe(0.3);
    expect(penetrationMultiplier('none', 'heavy')).toBe(0.1);
    expect(penetrationMultiplier('light', 'medium')).toBe(0.6);
    expect(penetrationMultiplier('light', 'heavy')).toBe(0.3);
    expect(penetrationMultiplier('medium', 'heavy')).toBe(0.6);
    expect(penetrationMultiplier('heavy', 'heavy')).toBe(1.0);
  });

  it('never reduces damage against unarmored targets', () => {
    for (const pen of ['none', 'light', 'medium', 'heavy'] as const) {
      expect(penetrationMultiplier(pen, 'none')).toBe(1.0);
    }
  });
});

describe('directional armor', () => {
  const armor: ArmorSet = { front: 'heavy', side: 'medium', rear: 'light' };

  it('picks the armor facing the attack direction', () => {
    expect(armorFacing(armor, 'front')).toBe('heavy');
    expect(armorFacing(armor, 'side')).toBe('medium');
    expect(armorFacing(armor, 'rear')).toBe('light');
  });

  it('makes a flank attack deal more damage than a frontal one with the same weapon', () => {
    const frontal = damageThroughArmor(35, 'medium', armorFacing(armor, 'front'));
    const flank = damageThroughArmor(35, 'medium', armorFacing(armor, 'side'));
    expect(flank).toBeGreaterThan(frontal);
  });
});

describe('damageThroughArmor', () => {
  it('rounds to a whole number', () => {
    expect(damageThroughArmor(35, 'medium', 'heavy')).toBe(21); // 35 * 0.6
  });

  it('never returns negative damage', () => {
    expect(damageThroughArmor(0, 'none', 'heavy')).toBe(0);
  });

  it('rejects negative input damage', () => {
    expect(() => damageThroughArmor(-1, 'none', 'none')).toThrow();
  });
});
