// 2D geometry in meters. Pure functions only.
import type { AttackDirection } from '../rules/combat';

export interface Vec2 {
  x: number;
  y: number;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function angleFrom(from: Vec2, to: Vec2): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/** Wraps an angle into (-PI, PI]. */
export function normalizeAngle(a: number): number {
  let r = a % (2 * Math.PI);
  if (r <= -Math.PI) r += 2 * Math.PI;
  if (r > Math.PI) r -= 2 * Math.PI;
  return r;
}

/**
 * Side of the target an attack comes from, measured against the target's facing.
 * Within 45 degrees of facing is front, within 135 degrees is side, anything else is rear.
 */
export function attackDirection(targetFacing: number, attacker: Vec2, target: Vec2): AttackDirection {
  const rel = Math.abs(normalizeAngle(angleFrom(target, attacker) - targetFacing));
  if (rel <= Math.PI / 4) return 'front';
  if (rel <= (3 * Math.PI) / 4) return 'side';
  return 'rear';
}

/** Moves from `from` toward `goal` by at most `maxStep` meters. */
export function moveToward(from: Vec2, goal: Vec2, maxStep: number): Vec2 {
  const d = distance(from, goal);
  if (d <= maxStep) return { x: goal.x, y: goal.y };
  const k = maxStep / d;
  return { x: from.x + (goal.x - from.x) * k, y: from.y + (goal.y - from.y) * k };
}
