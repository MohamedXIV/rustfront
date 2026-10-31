// Match timing and point economy. All functions are pure and deterministic.
// The server calls these with the elapsed match time, so the client can preview the same values.

export const HQ_MAX_HP = 1000;

/** Time of each phase boundary, in milliseconds since the match started. */
export const PHASE_MS = {
  rampStart: 6 * 60_000,
  overtimeStart: 8 * 60_000,
  matchEnd: 10 * 60_000,
} as const;

export const WAVE_INTERVAL_MS = 20_000;
export const WAVE_SIZE = 3;
export const STORED_SLOTS = 1;

/** Passive income per wave during build, and its peak right before Overtime. */
export const PASSIVE_BUILD = 10;
export const PASSIVE_RAMP_PEAK = 15;

/** Income multiplier applied during Overtime (rounded down). */
export const OVERTIME_MULTIPLIER = 1.5;

/** Point rewards for destroying enemy entities, before the Overtime multiplier. */
export const KILL_BONUS = { light: 2, structure: 5, heavy: 8 } as const;

export type MatchPhase = 'build' | 'ramp' | 'overtime' | 'ended';

export function matchPhase(elapsedMs: number): MatchPhase {
  if (elapsedMs >= PHASE_MS.matchEnd) return 'ended';
  if (elapsedMs >= PHASE_MS.overtimeStart) return 'overtime';
  if (elapsedMs >= PHASE_MS.rampStart) return 'ramp';
  return 'build';
}

/** Multiplier applied to all point income at this time. */
export function incomeMultiplier(elapsedMs: number): number {
  return matchPhase(elapsedMs) === 'overtime' ? OVERTIME_MULTIPLIER : 1;
}

/** Passive points granted at each wave. Rises linearly during ramp, then multiplies in Overtime. */
export function passiveIncomePerWave(elapsedMs: number): number {
  const phase = matchPhase(elapsedMs);
  if (phase === 'ended') return 0;
  if (phase === 'build') return PASSIVE_BUILD;
  if (phase === 'ramp') {
    const t = (elapsedMs - PHASE_MS.rampStart) / (PHASE_MS.overtimeStart - PHASE_MS.rampStart);
    return Math.round(PASSIVE_BUILD + (PASSIVE_RAMP_PEAK - PASSIVE_BUILD) * t);
  }
  return Math.floor(PASSIVE_RAMP_PEAK * OVERTIME_MULTIPLIER);
}

export type KillKind = keyof typeof KILL_BONUS;

/** Points awarded for destroying an enemy of this kind at this time. */
export function killReward(kind: KillKind, elapsedMs: number): number {
  return Math.floor(KILL_BONUS[kind] * incomeMultiplier(elapsedMs));
}

/**
 * Attempts to spend points. Never lets the balance go below zero.
 * Returns the unchanged balance and ok=false when the player cannot afford the cost.
 */
export function trySpend(points: number, cost: number): { points: number; ok: boolean } {
  if (cost < 0 || !Number.isFinite(cost)) throw new Error(`Invalid cost: ${cost}`);
  if (points < cost) return { points, ok: false };
  return { points: points - cost, ok: true };
}

export function addPoints(points: number, amount: number): number {
  if (amount < 0) throw new Error('Points can only be added with a non-negative amount');
  return points + amount;
}
