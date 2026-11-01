import { afterEach, describe, expect, it, vi } from 'vitest';
import { CARDS, getCard, getDefinition } from '../shared/data';
import { createRng } from '../shared/rules/waves';
import {
  abilityTargetError,
  cellOf,
  createMatch,
  providersOf as simProvidersOf,
  spawnEntity,
  structurePlacementError,
  unitDeployError,
  type BattleState,
} from '../shared/sim';
import type { TeamId } from '../shared/types';
import { LocalBattle, snapshotOf, viewEntitiesOf } from '../src/game/localBattle';
import type { ViewEntity } from '../src/game/source';
import {
  ARENA_FRAME,
  arenaRect,
  cardInfo,
  countsFor,
  endReasonLabel,
  formatClock,
  handRects,
  handView,
  inRect,
  isVisibleTo,
  lerp,
  outcomeFor,
  pendingProgress,
  placementHint,
  providersOf,
  SCREEN,
  tickAlpha,
  timeLeftMs,
  toArena,
  toScreen,
  HAND_TOP,
} from '../src/game/view';

afterEach(() => {
  vi.useRealTimers();
});

function entity(overrides: Partial<ViewEntity>): ViewEntity {
  return {
    id: 1,
    team: 'red',
    defId: 'machine_gun_turret',
    kind: 'structure',
    originX: 10,
    originY: 10,
    x: 10.5,
    y: 10.5,
    facing: 0,
    hp: 100,
    maxHp: 100,
    disabledUntilMs: 0,
    concealedUntilMs: 0,
    ...overrides,
  };
}

describe('screen geometry', () => {
  it('maps arena meters to screen pixels and back', () => {
    const p = { x: 12.25, y: 33.5 };
    const back = toArena(toScreen(p).x, toScreen(p).y);
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });

  it('keeps the arena inside the screen, between the HUD bar and the hand', () => {
    const r = arenaRect();
    expect(r.w).toBe(576);
    expect(r.h).toBe(360);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w).toBeLessThanOrEqual(SCREEN.width);
    expect(r.y).toBeGreaterThanOrEqual(40);
    expect(r.y + r.h).toBeLessThanOrEqual(HAND_TOP);
    expect(ARENA_FRAME.cell).toBe(9);
  });

  it('lays out the hand and the store slot on screen without overlaps', () => {
    const { hand, stored } = handRects();
    const all = [...hand, stored];
    for (const r of all) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(SCREEN.width);
      expect(r.y + r.h).toBeLessThanOrEqual(SCREEN.height);
      expect(inRect(arenaRect(), r.x, r.y)).toBe(false);
    }
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i]!;
        const b = all[j]!;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
    }
  });
});

describe('hand view', () => {
  it('places hand cards by slot and keeps the stored card apart', () => {
    const view = handView([
      { instanceId: 'a', cardId: 'medium_tank', zone: 'hand', slot: 2 },
      { instanceId: 'b', cardId: 'outpost', zone: 'stored', slot: 0 },
      { instanceId: 'c', cardId: 'scout_buggy', zone: 'hand', slot: 0 },
    ]);
    expect(view.slots[0]?.instanceId).toBe('c');
    expect(view.slots[1]).toBeNull();
    expect(view.slots[2]?.instanceId).toBe('a');
    expect(view.stored?.instanceId).toBe('b');
  });

  it('gives every card a definition and a positive cost', () => {
    for (const card of CARDS) {
      const info = cardInfo(card.id);
      expect(info.name.length).toBeGreaterThan(0);
      expect(info.cost).toBeGreaterThan(0);
      expect(getDefinition(card.id).category).toBe(card.category);
      expect(getCard(card.id).cost).toBe(info.cost);
    }
  });
});

describe('clock, phase, and outcome', () => {
  it('formats the match clock and clamps at the end', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(59_999)).toBe('0:59');
    expect(formatClock(599_999)).toBe('9:59');
    expect(formatClock(600_000)).toBe('10:00');
    expect(formatClock(-5)).toBe('0:00');
    expect(timeLeftMs(0)).toBe(600_000);
    expect(timeLeftMs(700_000)).toBe(0);
  });

  it('reports the outcome for each viewer', () => {
    expect(outcomeFor(null, 'red')).toBeNull();
    expect(outcomeFor('red', 'red')).toBe('victory');
    expect(outcomeFor('red', 'blue')).toBe('defeat');
    expect(outcomeFor('draw', 'blue')).toBe('draw');
    expect(endReasonLabel(null)).toBe('');
    expect(endReasonLabel('time_limit')).toMatch(/Time is up/);
  });
});

describe('visibility', () => {
  it('shows own pieces and enemy structures, hides enemy mines and concealed enemies', () => {
    expect(isVisibleTo(entity({ team: 'red', kind: 'mine' }), 'red', 0)).toBe(true);
    expect(isVisibleTo(entity({ team: 'blue', kind: 'mine' }), 'red', 0)).toBe(false);
    expect(isVisibleTo(entity({ team: 'blue', kind: 'structure' }), 'red', 0)).toBe(true);
    expect(isVisibleTo(entity({ team: 'blue', kind: 'unit', concealedUntilMs: 5000 }), 'red', 4999)).toBe(false);
    expect(isVisibleTo(entity({ team: 'blue', kind: 'unit', concealedUntilMs: 5000 }), 'red', 5000)).toBe(true);
    expect(isVisibleTo(entity({ team: 'red', kind: 'unit', concealedUntilMs: 9000 }), 'red', 1000)).toBe(true);
  });

  it('counts only what the viewer can see on each side', () => {
    const entities = [
      entity({ id: 1, team: 'red', kind: 'unit' }),
      entity({ id: 2, team: 'red', kind: 'structure' }),
      entity({ id: 3, team: 'blue', kind: 'unit', concealedUntilMs: 9000 }),
      entity({ id: 4, team: 'blue', kind: 'mine' }),
      entity({ id: 5, team: 'blue', kind: 'structure', hp: 0 }),
    ];
    expect(countsFor(entities, 'red', 0)).toEqual({ myUnits: 1, myStructures: 1, enemyUnits: 0, enemyStructures: 0 });
  });
});

describe('interpolation and pending abilities', () => {
  it('clamps the tick alpha and interpolates linearly', () => {
    expect(tickAlpha(1000, 1000)).toBe(0);
    expect(tickAlpha(1050, 1000)).toBeCloseTo(0.5);
    expect(tickAlpha(2000, 1000)).toBe(1);
    expect(tickAlpha(900, 1000)).toBe(0);
    expect(lerp(0, 10, 0.25)).toBeCloseTo(2.5);
  });

  it('counts pending abilities from 0 to 1 over their delay', () => {
    const base = { id: 1, team: 'red' as TeamId, defId: 'artillery_strike', x: 20, y: 20 };
    expect(pendingProgress({ ...base, resolveAtMs: 2500 }, 0)).toBeCloseTo(0);
    expect(pendingProgress({ ...base, resolveAtMs: 2500 }, 1250)).toBeCloseTo(0.5);
    expect(pendingProgress({ ...base, resolveAtMs: 2500 }, 2500)).toBe(1);
    expect(pendingProgress({ ...base, defId: 'emp_pulse', resolveAtMs: 0 }, 0)).toBe(1);
  });
});

describe('placement hints match the simulation', () => {
  /** Sample points cover the arena, its edges, and a little outside it. */
  function samplePoints(seed: number, count: number) {
    const rng = createRng(seed);
    return Array.from({ length: count }, () => ({
      x: -2 + rng.next() * 68,
      y: -2 + rng.next() * 44,
    }));
  }

  function withExtraTurret(state: BattleState, team: TeamId): BattleState {
    spawnEntity(state, { team, defId: 'machine_gun_turret', kind: 'structure', origin: { x: 14, y: 17 } });
    return state;
  }

  it.each([
    ['fresh match', (seed: number) => createMatch(seed)],
    ['with an occupied structure', (seed: number) => withExtraTurret(createMatch(seed), 'red')],
  ])('agrees with the sim validators (%s)', (_label, make) => {
    const counts = { ok: 0, rejected: 0 };
    for (const seed of [3, 11, 29]) {
      const state = make(seed);
      const entities = viewEntitiesOf(state);
      for (const team of ['red', 'blue'] as TeamId[]) {
        for (const p of samplePoints(seed * 7 + (team === 'red' ? 1 : 2), 120)) {
          const unit = placementHint('unit', 'medium_tank', p, entities, team);
          expect(unit.reason).toBe(unitDeployError(state, team, p));

          const ability = placementHint('ability', 'emp_pulse', p, entities, team);
          expect(ability.reason).toBe(abilityTargetError(p));

          const structure = placementHint('structure', 'machine_gun_turret', p, entities, team);
          expect(structure.reason).toBe(structurePlacementError(state, team, 'machine_gun_turret', cellOf(p)));
          expect(structure.origin).toEqual(cellOf(p));

          for (const hint of [unit, ability, structure]) {
            if (hint.ok) counts.ok++;
            else counts.rejected++;
          }
        }
      }
    }
    // The comparison is only meaningful if both outcomes occur.
    expect(counts.ok).toBeGreaterThan(0);
    expect(counts.rejected).toBeGreaterThan(0);
  });

  it('computes territory providers the same way the sim does', () => {
    const state = createMatch(5);
    const entities = viewEntitiesOf(state);
    for (const team of ['red', 'blue'] as TeamId[]) {
      const mine = providersOf(entities, team).map((p) => ({ center: p.center, radius: p.radius }));
      expect(mine).toEqual(simProvidersOf(state, team));
    }
  });
});

describe('demo battle', () => {
  it('reports the snapshot from the shared sim, with the viewer hand only', () => {
    const state = createMatch(42);
    const snap = snapshotOf(state, 'red');
    const redIds = new Set(state.teams.red.hand.hand.map((c) => c.instanceId));
    expect(snap.cards.length).toBe(redIds.size);
    for (const card of snap.cards) expect(redIds.has(card.instanceId)).toBe(true);
    expect(snap.points.red).toBe(state.teams.red.points);
    expect(snap.ended).toBe(false);
  });

  it('rejects unknown cards and accepts a store of a real card', async () => {
    const battle = new LocalBattle(42, 1);
    try {
      await expect(battle.play('no-such-card', 10, 10)).rejects.toThrow(/not available/);
      const first = battle.snapshot().cards.find((c) => c.zone === 'hand');
      expect(first).toBeDefined();
      await battle.store(first!.instanceId);
      const stored = battle.snapshot().cards.find((c) => c.zone === 'stored');
      expect(stored?.instanceId).toBe(first!.instanceId);
    } finally {
      battle.dispose();
    }
  });

  it('advances on the tick clock and stops when disposed', () => {
    vi.useFakeTimers();
    const battle = new LocalBattle(8, 1);
    const seen: number[] = [];
    battle.onChange(() => seen.push(battle.snapshot().elapsedMs));
    vi.advanceTimersByTime(1000);
    expect(battle.snapshot().elapsedMs).toBe(1000);
    expect(seen.length).toBe(10);
    battle.dispose();
    vi.advanceTimersByTime(1000);
    expect(battle.snapshot().elapsedMs).toBe(1000);
  });
});

describe('side panel counts on a fresh match', () => {
  it('counts each team headquarters as its own structure', () => {
    const entities = viewEntitiesOf(createMatch(1));
    for (const team of ['red', 'blue'] as TeamId[]) {
      const c = countsFor(entities, team, 0);
      expect(c.myStructures).toBe(1);
      expect(c.enemyStructures).toBe(1);
    }
  });
});
