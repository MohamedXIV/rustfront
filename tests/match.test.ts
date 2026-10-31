import { describe, expect, it } from 'vitest';
import { resolveTimeLimit, winnerWhenHqDestroyed } from '../shared/rules/match';

describe('time limit outcome', () => {
  it('gives the win to the Headquarters with more HP left', () => {
    expect(resolveTimeLimit(700, 400)).toBe('red');
    expect(resolveTimeLimit(120, 900)).toBe('blue');
  });

  it('is a draw when both Headquarters have the same HP', () => {
    expect(resolveTimeLimit(500, 500)).toBe('draw');
  });
});

describe('Headquarters destruction', () => {
  it('awards the win to the opponent immediately', () => {
    expect(winnerWhenHqDestroyed('red')).toBe('blue');
    expect(winnerWhenHqDestroyed('blue')).toBe('red');
  });
});
