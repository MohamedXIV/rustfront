import { describe, expect, it } from 'vitest';
import { tryPlayCard, tryStoreCard } from '../shared/sim/actions';
import { createMatch, type BattleState } from '../shared/sim/state';
import { abilityTargetError, inOwnTerritory, structurePlacementError, unitDeployError } from '../shared/sim/placement';
import type { CardInstance } from '../shared/types';

function withHand(state: BattleState, team: 'red' | 'blue', cards: CardInstance[]): void {
  state.teams[team].hand = { hand: cards, stored: null };
}

function card(instanceId: string, cardId: string): CardInstance {
  return { instanceId, cardId };
}

describe('territory', () => {
  it('projects territory around each Headquarters only', () => {
    const state = createMatch(1);
    expect(inOwnTerritory(state, 'red', { x: 8, y: 20 })).toBe(true);
    expect(inOwnTerritory(state, 'red', { x: 50, y: 20 })).toBe(false);
    expect(inOwnTerritory(state, 'blue', { x: 50, y: 20 })).toBe(true);
  });

  it('collapses territory when its provider is destroyed', () => {
    const state = createMatch(1);
    const hq = state.entities.get(state.teams.red.hqId)!;
    hq.hp = 0;
    expect(inOwnTerritory(state, 'red', { x: 8, y: 20 })).toBe(false);
  });
});

describe('placement rules', () => {
  it('accepts a structure inside own territory', () => {
    const state = createMatch(1);
    expect(structurePlacementError(state, 'red', 'machine_gun_turret', { x: 9, y: 18 })).toBeNull();
  });

  it('rejects a structure outside own territory', () => {
    const state = createMatch(1);
    expect(structurePlacementError(state, 'red', 'machine_gun_turret', { x: 40, y: 18 })).toMatch(/territory/);
  });

  it('rejects a structure that overlaps an existing one', () => {
    const state = createMatch(1);
    // Red HQ occupies cells 4..6 x 18..20.
    expect(structurePlacementError(state, 'red', 'machine_gun_turret', { x: 5, y: 19 })).toMatch(/occupied/);
  });

  it('rejects a structure off the arena edge', () => {
    const state = createMatch(1);
    expect(structurePlacementError(state, 'red', 'machine_gun_turret', { x: -1, y: 0 })).toMatch(/outside/);
  });

  it('requires unit deploy points in own territory', () => {
    const state = createMatch(1);
    expect(unitDeployError(state, 'red', { x: 10, y: 20 })).toBeNull();
    expect(unitDeployError(state, 'red', { x: 50, y: 20 })).toMatch(/territory/);
  });

  it('lets abilities target anywhere in the arena', () => {
    expect(abilityTargetError({ x: 60, y: 30 })).toBeNull();
    expect(abilityTargetError({ x: 999, y: 30 })).toMatch(/outside/);
  });
});

describe('playing cards', () => {
  it('plays a structure: spends points, removes the card, spawns the structure', () => {
    const state = createMatch(2);
    withHand(state, 'red', [card('c1', 'machine_gun_turret')]); // cost 10
    const before = state.teams.red.points;
    const result = tryPlayCard(state, 'red', { kind: 'structure', instanceId: 'c1', origin: { x: 9, y: 18 } });
    expect(result).toEqual({ ok: true });
    expect(state.teams.red.points).toBe(before - 10);
    expect(state.teams.red.hand.hand).toHaveLength(0);
    const turrets = [...state.entities.values()].filter((e) => e.defId === 'machine_gun_turret');
    expect(turrets).toHaveLength(1);
  });

  it('refuses to play without enough points and changes nothing', () => {
    const state = createMatch(2);
    state.teams.red.points = 3;
    withHand(state, 'red', [card('c1', 'machine_gun_turret')]);
    const result = tryPlayCard(state, 'red', { kind: 'structure', instanceId: 'c1', origin: { x: 9, y: 18 } });
    expect(result).toEqual({ ok: false, reason: 'Not enough points' });
    expect(state.teams.red.points).toBe(3);
    expect(state.teams.red.hand.hand).toHaveLength(1);
  });

  it('snaps unit deployments to the cell centre, so mirrored clicks mirror exactly', () => {
    const state = createMatch(2);
    withHand(state, 'red', [card('r1', 'medium_tank')]);
    withHand(state, 'blue', [card('b1', 'medium_tank')]);
    expect(tryPlayCard(state, 'red', { kind: 'unit', instanceId: 'r1', pos: { x: 12.3, y: 19.8 } })).toEqual({ ok: true });
    expect(tryPlayCard(state, 'blue', { kind: 'unit', instanceId: 'b1', pos: { x: 51.7, y: 19.8 } })).toEqual({ ok: true });
    const tanks = [...state.entities.values()].filter((e) => e.defId === 'medium_tank');
    const red = tanks.find((e) => e.team === 'red');
    const blue = tanks.find((e) => e.team === 'blue');
    expect(red?.pos).toEqual({ x: 12.5, y: 19.5 });
    expect(blue?.pos).toEqual({ x: 51.5, y: 19.5 });
  });

  it('refuses a card the player does not hold', () => {
    const state = createMatch(2);
    withHand(state, 'red', []);
    const result = tryPlayCard(state, 'red', { kind: 'structure', instanceId: 'nope', origin: { x: 9, y: 18 } });
    expect(result.ok).toBe(false);
  });

  it('refuses a card played with the wrong action type', () => {
    const state = createMatch(2);
    withHand(state, 'red', [card('c1', 'machine_gun_turret')]);
    const result = tryPlayCard(state, 'red', { kind: 'unit', instanceId: 'c1', pos: { x: 10, y: 20 } });
    expect(result.ok).toBe(false);
  });

  it('does not spend points when placement is invalid', () => {
    const state = createMatch(2);
    withHand(state, 'red', [card('c1', 'machine_gun_turret')]);
    const before = state.teams.red.points;
    const result = tryPlayCard(state, 'red', { kind: 'structure', instanceId: 'c1', origin: { x: 40, y: 18 } });
    expect(result.ok).toBe(false);
    expect(state.teams.red.points).toBe(before);
    expect(state.teams.red.hand.hand).toHaveLength(1);
  });

  it('spawns every body of a multi-unit card (drone swarm)', () => {
    const state = createMatch(2);
    withHand(state, 'red', [card('c1', 'drone_swarm')]); // cost 12, spawns 3
    const result = tryPlayCard(state, 'red', { kind: 'unit', instanceId: 'c1', pos: { x: 10, y: 20 } });
    expect(result).toEqual({ ok: true });
    const drones = [...state.entities.values()].filter((e) => e.defId === 'drone_swarm');
    expect(drones).toHaveLength(3);
    expect(drones.every((d) => d.layer === 'air')).toBe(true);
  });

  it('schedules an ability that resolves after its delay', () => {
    const state = createMatch(2);
    withHand(state, 'red', [card('c1', 'artillery_strike')]); // cost 18
    state.teams.red.points = 20;
    const result = tryPlayCard(state, 'red', { kind: 'ability', instanceId: 'c1', pos: { x: 60, y: 20 } });
    expect(result).toEqual({ ok: true });
    expect(state.pending).toHaveLength(1);
    expect(state.pending[0].resolveAtMs).toBe(state.elapsedMs + 2500);
  });

  it('stores a card and discards the previously stored one', () => {
    const state = createMatch(3);
    state.teams.red.hand = {
      hand: [card('a', 'medium_tank'), card('b', 'scout_buggy')],
      stored: card('old', 'flamethrower'),
    };
    const first = tryStoreCard(state, 'red', 'a');
    expect(first).toEqual({ ok: true, discardedInstanceId: 'old' });
    expect(state.teams.red.hand.stored?.instanceId).toBe('a');
    expect(state.teams.red.hand.hand.map((c) => c.instanceId)).toEqual(['b']);
  });

  it('plays the stored card later', () => {
    const state = createMatch(3);
    state.teams.red.hand = { hand: [], stored: card('s', 'medium_tank') };
    const result = tryPlayCard(state, 'red', { kind: 'unit', instanceId: 's', pos: { x: 10, y: 20 } });
    expect(result).toEqual({ ok: true });
    expect(state.teams.red.hand.stored).toBeNull();
  });
});
