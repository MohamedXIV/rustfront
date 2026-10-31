// Match outcome rules. Pure functions.
import type { TeamId } from '../types';

export type TimeLimitResult = TeamId | 'draw';

/**
 * Decides the winner when the time limit is reached.
 * The player whose Headquarters took less damage wins (has more HP left).
 * Equal HP is a draw.
 */
export function resolveTimeLimit(redHqHp: number, blueHqHp: number): TimeLimitResult {
  if (redHqHp > blueHqHp) return 'red';
  if (blueHqHp > redHqHp) return 'blue';
  return 'draw';
}

/** Winner when a Headquarters reaches zero HP. The other team wins immediately. */
export function winnerWhenHqDestroyed(destroyed: TeamId): TeamId {
  return destroyed === 'red' ? 'blue' : 'red';
}
