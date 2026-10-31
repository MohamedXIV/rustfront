// Armor and penetration rules. Pure functions.
import type { ArmorLevel, ArmorSet, PenetrationLevel } from '../types';

export type AttackDirection = keyof ArmorSet;

/** Multiplier for a penetration level against an armor level. Rows are penetration, columns are armor. */
const PENETRATION_TABLE: Record<PenetrationLevel, Record<ArmorLevel, number>> = {
  none: { none: 1.0, light: 0.6, medium: 0.3, heavy: 0.1 },
  light: { none: 1.0, light: 1.0, medium: 0.6, heavy: 0.3 },
  medium: { none: 1.0, light: 1.0, medium: 1.0, heavy: 0.6 },
  heavy: { none: 1.0, light: 1.0, medium: 1.0, heavy: 1.0 },
};

export function penetrationMultiplier(penetration: PenetrationLevel, armor: ArmorLevel): number {
  return PENETRATION_TABLE[penetration][armor];
}

/** Armor level a shot meets, based on which side it came from. */
export function armorFacing(armor: ArmorSet, from: AttackDirection): ArmorLevel {
  return armor[from];
}

/** Damage after applying armor. Rounded to the nearest whole point, never below zero. */
export function damageThroughArmor(
  damage: number,
  penetration: PenetrationLevel,
  armor: ArmorLevel,
): number {
  if (damage < 0) throw new Error('Damage cannot be negative');
  return Math.max(0, Math.round(damage * penetrationMultiplier(penetration, armor)));
}
