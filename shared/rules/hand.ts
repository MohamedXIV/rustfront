// Hand and stored-slot state transitions. Pure functions; the server applies them to authoritative state.
import type { CardInstance } from '../types';

export interface HandState {
  hand: readonly CardInstance[];
  stored: CardInstance | null;
}

export const EMPTY_HAND: HandState = { hand: [], stored: null };

/**
 * Applies a new card wave. Unplayed cards in the hand expire. The stored card survives.
 * Returns the expired cards so the caller can report them.
 */
export function receiveWave(
  state: HandState,
  incoming: readonly CardInstance[],
): { state: HandState; expired: readonly CardInstance[] } {
  return {
    state: { hand: [...incoming], stored: state.stored },
    expired: state.hand,
  };
}

/**
 * Moves a card from the hand into the stored slot. The previously stored card is discarded.
 * Returns the discarded card, if any.
 */
export function storeCard(
  state: HandState,
  instanceId: string,
): { state: HandState; discarded: CardInstance | null } {
  const card = state.hand.find((c) => c.instanceId === instanceId);
  if (!card) throw new Error(`Card ${instanceId} is not in hand`);
  return {
    state: { hand: state.hand.filter((c) => c.instanceId !== instanceId), stored: card },
    discarded: state.stored,
  };
}

/** Removes a played card from either the hand or the stored slot. */
export function playCard(state: HandState, instanceId: string): HandState {
  if (state.stored?.instanceId === instanceId) return { hand: state.hand, stored: null };
  if (state.hand.some((c) => c.instanceId === instanceId)) {
    return { hand: state.hand.filter((c) => c.instanceId !== instanceId), stored: state.stored };
  }
  throw new Error(`Card ${instanceId} is not playable from this hand`);
}
