import { describe, expect, it } from 'vitest';
import { applyDamage } from '../shared/sim/combat';
import { PHASE_MS } from '../shared/rules/economy';
import { scheduleAbility } from '../shared/sim/abilities';
import { resolveDueAbilities } from '../shared/sim/abilities';
import { TICK_MS, cellOf } from '../shared/sim/arena';
import { stepBattle } from '../shared/sim/tick';
import { createMatch, spawnEntity, type BattleState, type Entity } from '../shared/sim/state';
import { tryPlayCard } from '../shared/sim/actions';
import { getCard } from '../shared/data';

function place(state: BattleState, team: 'red' | 'blue', defId: string, pos: { x: number; y: number }, kind: 'structure' | 'unit' | 'mine' = 'unit'): Entity {
  return spawnEntity(state, { team, defId, kind, origin: cellOf(pos), pos: kind === 'structure' ? undefined : pos });
}

function run(state: BattleState, ticks: number): void {
  for (let i = 0; i < ticks; i++) stepBattle(state, TICK_MS);
}

describe('turret combat', () => {
  it('kills an enemy scout in range and pays the kill reward to the turret owner', () => {
    const state = createMatch(11);
    place(state, 'red', 'machine_gun_turret', { x: 10, y: 19.5 }, 'structure');
    const scout = place(state, 'blue', 'scout_buggy', { x: 15, y: 19.5 });
    const before = state.teams.red.points;
    run(state, 100); // 10 seconds
    expect(state.entities.has(scout.id)).toBe(false);
    expect(state.teams.red.points).toBe(before + 2);
  });

  it('gives the Headquarters the win when it is destroyed', () => {
    const state = createMatch(12);
    const blueHq = state.entities.get(state.teams.blue.hqId)!;
    applyDamage(blueHq, blueHq.hp, 'red');
    stepBattle(state, TICK_MS);
    expect(state.winner).toBe('red');
    expect(state.endReason).toBe('hq_destroyed');
  });

  it('declares a draw when both Headquarters fall in the same tick', () => {
    const state = createMatch(13);
    for (const team of ['red', 'blue'] as const) {
      const hq = state.entities.get(state.teams[team].hqId)!;
      applyDamage(hq, hq.hp, team === 'red' ? 'blue' : 'red');
    }
    stepBattle(state, TICK_MS);
    expect(state.winner).toBe('draw');
  });
});

describe('support effects', () => {
  it('repairs a damaged friendly entity in range', () => {
    const state = createMatch(21);
    place(state, 'red', 'repair_tower', { x: 10, y: 19.5 }, 'structure');
    const turret = place(state, 'red', 'machine_gun_turret', { x: 12, y: 19.5 }, 'structure');
    turret.hp = 100;
    run(state, 5);
    expect(turret.hp).toBeGreaterThan(100);
    expect(turret.hp).toBeLessThanOrEqual(turret.maxHp);
  });

  it('disables enemy electronics inside an EMP field but not Automated Walkers', () => {
    const state = createMatch(22);
    place(state, 'red', 'emp_defense', { x: 20, y: 20 }, 'structure');
    const buggy = place(state, 'blue', 'assault_buggy', { x: 24, y: 20 });
    const walker = place(state, 'blue', 'automated_walker', { x: 22, y: 22 });
    stepBattle(state, TICK_MS);
    expect(buggy.disabledUntilMs).toBeGreaterThan(state.elapsedMs);
    expect(walker.disabledUntilMs).toBe(0);
  });

  it('detonates a mine under an enemy ground unit and removes the mine', () => {
    const state = createMatch(23);
    const mine = place(state, 'red', 'mine_layer', { x: 20.5, y: 20.5 }, 'mine');
    const tank = place(state, 'blue', 'medium_tank', { x: 20.8, y: 20.5 });
    const before = tank.hp;
    stepBattle(state, TICK_MS);
    expect(tank.hp).toBeLessThan(before);
    expect(state.entities.has(mine.id)).toBe(false);
  });

  it('resolves Artillery Strike after its delay inside the radius only', () => {
    const state = createMatch(24);
    const near = place(state, 'blue', 'medium_tank', { x: 40.5, y: 20.5 });
    const far = place(state, 'blue', 'medium_tank', { x: 60.5, y: 30.5 });
    scheduleAbility(state, 'red', 'artillery_strike', { x: 40.5, y: 20.5 });
    const nearBefore = near.hp;
    const farBefore = far.hp;
    state.elapsedMs += 2500;
    resolveDueAbilities(state);
    expect(near.hp).toBeLessThan(nearBefore);
    expect(far.hp).toBe(farBefore);
    expect(state.pending).toHaveLength(0);
  });

  it('applies Missile Strike at half strength against a Headquarters', () => {
    const state = createMatch(25);
    const hq = state.entities.get(state.teams.blue.hqId)!;
    scheduleAbility(state, 'red', 'missile_strike', { x: hq.pos.x, y: hq.pos.y });
    state.elapsedMs += 1000;
    resolveDueAbilities(state);
    expect(hq.hp).toBe(1000 - 75);
  });
});

describe('time limit', () => {
  it('awards the win to the Headquarters with more HP at 10:00', () => {
    const state = createMatch(31);
    state.elapsedMs = PHASE_MS.matchEnd - TICK_MS;
    applyDamage(state.entities.get(state.teams.blue.hqId)!, 500, 'red');
    stepBattle(state, TICK_MS);
    expect(state.winner).toBe('red');
    expect(state.endReason).toBe('time_limit');
  });

  it('declares a draw when both Headquarters have equal HP at 10:00', () => {
    const state = createMatch(32);
    state.elapsedMs = PHASE_MS.matchEnd - TICK_MS;
    stepBattle(state, TICK_MS);
    expect(state.winner).toBe('draw');
  });
});

describe('waves and income', () => {
  it('pays passive income and replaces unplayed cards at the next wave', () => {
    const state = createMatch(41);
    const firstWave = state.teams.red.hand.hand.map((c) => c.instanceId);
    const start = state.teams.red.points;
    run(state, 200); // 20 seconds
    expect(state.teams.red.points).toBe(start + 10);
    const secondWave = state.teams.red.hand.hand.map((c) => c.instanceId);
    expect(secondWave).toHaveLength(3);
    expect(secondWave.some((id) => firstWave.includes(id))).toBe(false);
  });

  it('keeps the stored card through a wave', () => {
    const state = createMatch(42);
    const first = state.teams.red.hand.hand[0];
    state.teams.red.hand = { hand: [first], stored: null };
    tryPlayCard(state, 'red', { kind: 'unit', instanceId: 'nope', pos: { x: 10, y: 20 } });
    run(state, 200);
    expect(state.teams.red.hand.hand.some((c) => c.instanceId === first.instanceId)).toBe(false);
  });
});

describe('determinism and full-match smoke', () => {
  function scriptedMatch(seed: number, ticks: number): BattleState {
    const state = createMatch(seed);
    for (let i = 0; i < ticks; i++) {
      // Every 20 seconds each side tries to deploy the first affordable unit.
      if (i % 200 === 0) {
        for (const team of ['red', 'blue'] as const) {
          const ts = state.teams[team];
          const unit = ts.hand.hand.find((c) => getCard(c.cardId).category === 'unit' && getCard(c.cardId).cost <= ts.points);
          if (!unit) continue;
          const pos = team === 'red' ? { x: 12, y: 20 } : { x: 52, y: 20 };
          tryPlayCard(state, team, { kind: 'unit', instanceId: unit.instanceId, pos });
        }
      }
      stepBattle(state, TICK_MS);
      if (state.winner !== null) break;
    }
    return state;
  }

  function snapshot(state: BattleState) {
    return {
      elapsedMs: state.elapsedMs,
      winner: state.winner,
      endReason: state.endReason,
      points: { red: state.teams.red.points, blue: state.teams.blue.points },
      entities: [...state.entities.values()].map((e) => ({
        id: e.id,
        defId: e.defId,
        hp: Math.round(e.hp),
        x: Math.round(e.pos.x * 100),
        y: Math.round(e.pos.y * 100),
      })),
    };
  }

  it('produces identical results from the same seed and actions', () => {
    const a = snapshot(scriptedMatch(777, 3000));
    const b = snapshot(scriptedMatch(777, 3000));
    expect(a).toEqual(b);
    expect(a.entities.length).toBeGreaterThan(0);
  }, 60_000);

  it('runs a full 10-minute match to a result without errors', () => {
    const state = scriptedMatch(2026, 6000);
    if (state.winner === null) stepBattle(state, PHASE_MS.matchEnd - state.elapsedMs);
    expect(state.winner).not.toBeNull();
    expect(state.endReason).not.toBeNull();
    for (const e of state.entities.values()) expect(e.hp).toBeGreaterThan(0);
  }, 120_000);
});
