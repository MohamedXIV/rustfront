import { describe, expect, it } from 'vitest';
import { ABILITIES, ALL_DEFINITIONS, CARDS, HEADQUARTERS, STRUCTURES, UNITS, getCard, getDefinition } from '../shared/data';

describe('roster data', () => {
  it('has the approved roster: 11 structures, 10 units, 5 abilities', () => {
    expect(STRUCTURES).toHaveLength(11);
    expect(UNITS).toHaveLength(10);
    expect(ABILITIES).toHaveLength(5);
    expect(CARDS).toHaveLength(26);
  });

  it('keeps definition ids unique across the whole registry', () => {
    const ids = ALL_DEFINITIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every card a matching definition in the same category', () => {
    for (const card of CARDS) {
      const def = getDefinition(card.id);
      expect(def.category, `card ${card.id}`).toBe(card.category);
    }
  });

  it('gives every definition a card except the Headquarters', () => {
    const cardIds = new Set(CARDS.map((c) => c.id));
    for (const def of ALL_DEFINITIONS) {
      if (def.id === HEADQUARTERS.id) continue;
      expect(cardIds.has(def.id), `definition ${def.id} has no card`).toBe(true);
    }
  });

  it('keeps costs inside the category bands from DESIGN.md', () => {
    const bands = {
      structure: [8, 14],
      unit: [10, 18],
      ability: [12, 20],
    } as const;
    for (const card of CARDS) {
      const [min, max] = bands[card.category];
      expect(card.cost, `card ${card.id}`).toBeGreaterThanOrEqual(min);
      expect(card.cost, `card ${card.id}`).toBeLessThanOrEqual(max);
    }
  });

  it('uses only positive spawn weights', () => {
    for (const card of CARDS) expect(card.weight, card.id).toBeGreaterThan(0);
  });

  it('starts the Headquarters at 1000 HP and keeps it out of the card pool', () => {
    expect(HEADQUARTERS.hp).toBe(1000);
    expect(CARDS.some((c) => c.id === HEADQUARTERS.id)).toBe(false);
    expect(() => getCard(HEADQUARTERS.id)).toThrow();
  });

  it('keeps stats physically valid', () => {
    for (const def of ALL_DEFINITIONS) {
      if (def.category === 'ability') {
        expect(def.radius, def.id).toBeGreaterThan(0);
        expect(def.delayMs, def.id).toBeGreaterThanOrEqual(0);
        continue;
      }
      expect(def.hp, def.id).toBeGreaterThan(0);
      if (def.category === 'unit') expect(def.speed, def.id).toBeGreaterThan(0);
      if (def.weapon) {
        expect(def.weapon.accuracy, def.id).toBeGreaterThan(0);
        expect(def.weapon.accuracy, def.id).toBeLessThanOrEqual(1);
      }
    }
  });

  it('places the Drone Swarm on the air layer with three bodies', () => {
    const drones = getDefinition('drone_swarm');
    expect(drones.category).toBe('unit');
    if (drones.category === 'unit') {
      expect(drones.layer).toBe('air');
      expect(drones.spawnCount).toBe(3);
    }
  });

  it('keeps the Anti-Air Turret air-only', () => {
    const aa = getDefinition('anti_air_turret');
    if (aa.category !== 'structure' || !aa.weapon) throw new Error('expected weapon');
    expect(aa.weapon.targets).toBe('air');
  });
});
