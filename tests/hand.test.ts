import { describe, expect, it } from 'vitest';
import { EMPTY_HAND, playCard, receiveWave, storeCard, type HandState } from '../shared/rules/hand';
import type { CardInstance } from '../shared/types';

const card = (instanceId: string, cardId = 'medium_tank'): CardInstance => ({ instanceId, cardId });

describe('wave arrival', () => {
  it('expires every unplayed card from the previous wave', () => {
    const before: HandState = { hand: [card('a'), card('b'), card('c')], stored: null };
    const { state, expired } = receiveWave(before, [card('d'), card('e'), card('f')]);
    expect(expired.map((c) => c.instanceId)).toEqual(['a', 'b', 'c']);
    expect(state.hand.map((c) => c.instanceId)).toEqual(['d', 'e', 'f']);
  });

  it('keeps the stored card across waves', () => {
    const before: HandState = { hand: [card('a')], stored: card('s') };
    const { state, expired } = receiveWave(before, [card('b')]);
    expect(state.stored?.instanceId).toBe('s');
    expect(expired.map((c) => c.instanceId)).toEqual(['a']);
  });
});

describe('stored slot', () => {
  it('moves a card from hand into the slot', () => {
    const start: HandState = { hand: [card('a'), card('b')], stored: null };
    const { state, discarded } = storeCard(start, 'a');
    expect(state.stored?.instanceId).toBe('a');
    expect(state.hand.map((c) => c.instanceId)).toEqual(['b']);
    expect(discarded).toBeNull();
  });

  it('discards the previously stored card when a new one is stored', () => {
    const start: HandState = { hand: [card('a')], stored: card('old') };
    const { state, discarded } = storeCard(start, 'a');
    expect(state.stored?.instanceId).toBe('a');
    expect(discarded?.instanceId).toBe('old');
  });

  it('rejects storing a card that is not in hand', () => {
    expect(() => storeCard(EMPTY_HAND, 'missing')).toThrow();
  });
});

describe('playing cards', () => {
  it('removes a played card from the hand', () => {
    const start: HandState = { hand: [card('a'), card('b')], stored: null };
    expect(playCard(start, 'a').hand.map((c) => c.instanceId)).toEqual(['b']);
  });

  it('clears the stored slot when the stored card is played', () => {
    const start: HandState = { hand: [], stored: card('s') };
    expect(playCard(start, 's')).toEqual({ hand: [], stored: null });
  });

  it('rejects playing a card that is not available', () => {
    expect(() => playCard(EMPTY_HAND, 'nope')).toThrow();
  });
});
