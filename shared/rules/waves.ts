// Card wave generation: weighted random draws with budget-aware constraints.
// Uses an injected RNG so the server and tests can reproduce results from a seed.
import { CARDS } from '../data/cards';
import type { CardDef } from '../types';
import { matchPhase } from './economy';

export interface Rng {
  /** Returns a number in [0, 1). */
  next(): number;
  /** Internal 32-bit state. Passing it to restoreRng continues the same sequence. */
  state(): number;
}

function makeRng(initial: number): Rng {
  let s = initial >>> 0;
  return {
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    state() {
      return s;
    },
  };
}

/** Small, fast, seedable PRNG (mulberry32). Same seed gives the same sequence. */
export function createRng(seed: number): Rng {
  return makeRng(seed);
}

/** Rebuilds an RNG from a state previously read with state(). */
export function restoreRng(state: number): Rng {
  return makeRng(state);
}

/** Costs at or above this value count as expensive for hand-balance purposes. */
export const EXPENSIVE_COST = 14;
const MAX_ATTEMPTS = 8;

/**
 * Spawn weight for a card at a given time. Power cards become more common as the match escalates:
 * ×1.5 during ramp, ×2 during overtime.
 */
export function cardWeight(card: CardDef, elapsedMs: number): number {
  if (card.rarity !== 'power') return card.weight;
  const phase = matchPhase(elapsedMs);
  if (phase === 'overtime') return card.weight * 2;
  if (phase === 'ramp') return card.weight * 1.5;
  return card.weight;
}

function pickWeighted(rng: Rng, elapsedMs: number, pool: readonly CardDef[]): CardDef {
  const weights = pool.map((c) => cardWeight(c, elapsedMs));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = rng.next() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/**
 * Draws one wave of card ids. Rejects hands that are entirely expensive or three copies of the
 * same card, and retries a bounded number of times. If the retry budget runs out, the last draw is used.
 */
export function drawWave(
  rng: Rng,
  elapsedMs: number,
  size: number,
  pool: readonly CardDef[] = CARDS,
): string[] {
  if (pool.length === 0) throw new Error('Card pool is empty');
  let hand: CardDef[] = [];
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    hand = Array.from({ length: size }, () => pickWeighted(rng, elapsedMs, pool));
    const allExpensive = hand.every((c) => c.cost >= EXPENSIVE_COST);
    const allSame = hand.every((c) => c.id === hand[0].id);
    if (!allExpensive && !allSame) break;
  }
  return hand.map((c) => c.id);
}
