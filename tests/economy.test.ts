import { describe, expect, it } from 'vitest';
import {
  addPoints,
  incomeMultiplier,
  killReward,
  matchPhase,
  passiveIncomePerWave,
  trySpend,
} from '../shared/rules/economy';

const MIN = 60_000;

describe('match phases', () => {
  it('moves through build, ramp, overtime, and ended on the timeline', () => {
    expect(matchPhase(0)).toBe('build');
    expect(matchPhase(6 * MIN - 1)).toBe('build');
    expect(matchPhase(6 * MIN)).toBe('ramp');
    expect(matchPhase(8 * MIN)).toBe('overtime');
    expect(matchPhase(10 * MIN)).toBe('ended');
  });
});

describe('passive income', () => {
  it('pays 10 per wave during build', () => {
    expect(passiveIncomePerWave(0)).toBe(10);
    expect(passiveIncomePerWave(5 * MIN)).toBe(10);
  });

  it('rises linearly from 10 to 15 during ramp', () => {
    expect(passiveIncomePerWave(6 * MIN)).toBe(10);
    expect(passiveIncomePerWave(7 * MIN)).toBe(13); // midpoint: 12.5 rounds to 13
    expect(passiveIncomePerWave(8 * MIN - 1)).toBe(15);
  });

  it('multiplies by 1.5 and rounds down in overtime', () => {
    expect(passiveIncomePerWave(8 * MIN)).toBe(22);
    expect(passiveIncomePerWave(9 * MIN)).toBe(22);
  });

  it('pays nothing once the match has ended', () => {
    expect(passiveIncomePerWave(10 * MIN)).toBe(0);
  });
});

describe('kill rewards', () => {
  it('uses base bonuses before overtime', () => {
    expect(killReward('light', 0)).toBe(2);
    expect(killReward('structure', 5 * MIN)).toBe(5);
    expect(killReward('heavy', 7 * MIN)).toBe(8);
  });

  it('applies the overtime multiplier, rounded down', () => {
    expect(incomeMultiplier(8 * MIN)).toBe(1.5);
    expect(killReward('light', 8 * MIN)).toBe(3);
    expect(killReward('structure', 8 * MIN)).toBe(7);
    expect(killReward('heavy', 8 * MIN)).toBe(12);
  });
});

describe('points spending', () => {
  it('spends when affordable', () => {
    expect(trySpend(20, 15)).toEqual({ points: 5, ok: true });
  });

  it('refuses without changing the balance when unaffordable', () => {
    expect(trySpend(10, 15)).toEqual({ points: 10, ok: false });
  });

  it('never drops below zero, even with an exact spend', () => {
    expect(trySpend(12, 12)).toEqual({ points: 0, ok: true });
  });

  it('rejects invalid costs', () => {
    expect(() => trySpend(10, -1)).toThrow();
    expect(() => trySpend(10, Number.NaN)).toThrow();
  });

  it('adds points only with non-negative amounts', () => {
    expect(addPoints(3, 10)).toBe(13);
    expect(() => addPoints(3, -1)).toThrow();
  });
});
