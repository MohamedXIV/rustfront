import { describe, expect, it } from 'vitest';
import { CARDS, getCard } from '../shared/data';
import { EXPENSIVE_COST, cardWeight, createRng, drawWave } from '../shared/rules/waves';

describe('seeded RNG', () => {
  it('gives the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
  });

  it('returns values in [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('card weights over time', () => {
  it('leaves non-power cards unchanged', () => {
    const common = getCard('medium_tank');
    expect(cardWeight(common, 0)).toBe(common.weight);
    expect(cardWeight(common, 9 * 60_000)).toBe(common.weight);
  });

  it('boosts power cards during ramp and overtime', () => {
    const power = getCard('artillery_strike');
    expect(cardWeight(power, 0)).toBe(power.weight);
    expect(cardWeight(power, 7 * 60_000)).toBe(power.weight * 1.5);
    expect(cardWeight(power, 9 * 60_000)).toBe(power.weight * 2);
  });
});

describe('wave drawing', () => {
  it('returns the requested number of known cards', () => {
    const rng = createRng(1);
    const wave = drawWave(rng, 0, 3);
    expect(wave).toHaveLength(3);
    for (const id of wave) expect(() => getCard(id)).not.toThrow();
  });

  it('is reproducible from the same seed', () => {
    expect(drawWave(createRng(99), 0, 3)).toEqual(drawWave(createRng(99), 0, 3));
  });

  it('never returns a hand that is entirely expensive', () => {
    const rng = createRng(2024);
    for (let i = 0; i < 500; i++) {
      const wave = drawWave(rng, 9 * 60_000, 3);
      const allExpensive = wave.every((id) => getCard(id).cost >= EXPENSIVE_COST);
      expect(allExpensive).toBe(false);
    }
  });

  it('avoids three copies of the same card in almost all hands', () => {
    const rng = createRng(5);
    let triples = 0;
    const trials = 500;
    for (let i = 0; i < trials; i++) {
      const wave = drawWave(rng, 0, 3);
      if (wave.every((id) => id === wave[0])) triples++;
    }
    // The retry rule rejects triples. Only the final fallback draw can still produce one.
    expect(triples / trials).toBeLessThan(0.01);
  });

  it('draws only from the given pool', () => {
    const pool = CARDS.filter((c) => c.category === 'ability');
    const wave = drawWave(createRng(3), 0, 3, pool);
    for (const id of wave) expect(getCard(id).category).toBe('ability');
  });
});
