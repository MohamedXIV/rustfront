// Advances the battle by one fixed step. Order: waves, abilities, fields, units, mines, deaths, outcome.
import { addPoints, killReward, PHASE_MS, WAVE_INTERVAL_MS } from '../rules/economy';
import { resolveTimeLimit, winnerWhenHqDestroyed } from '../rules/match';
import type { TeamId } from '../types';
import { TICK_MS, type Cell, cellIndex, cellOf } from './arena';
import { resolveDueAbilities } from './abilities';
import {
  acquireTarget,
  defOf,
  emitterFields,
  enemyOf,
  fire,
  isHeadquarters,
  killKindOf,
  repairPulse,
  triggerMines,
  weaponOf,
} from './combat';
import { angleFrom, distance, moveToward, type Vec2 } from './geometry';
import { buildBlocked, findPath } from './pathfinding';
import { deliverWave, hqHp, TEAMS, type BattleState, type Entity } from './state';

export function stepBattle(state: BattleState, dtMs: number = TICK_MS): void {
  if (state.winner !== null) return;
  state.elapsedMs += dtMs;
  const now = state.elapsedMs;

  if (now >= PHASE_MS.matchEnd) {
    state.winner = resolveTimeLimit(hqHp(state, 'red'), hqHp(state, 'blue'));
    state.endReason = 'time_limit';
    return;
  }

  while (now >= state.nextWaveAtMs) {
    for (const team of TEAMS) deliverWave(state, team, true);
    state.nextWaveAtMs += WAVE_INTERVAL_MS;
  }

  resolveDueAbilities(state);
  emitterFields(state);

  const blocked = buildBlocked(state);
  const ids = [...state.entities.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    const e = state.entities.get(id);
    if (!e || e.hp <= 0) continue;
    updateEntity(state, e, dtMs, blocked);
  }

  triggerMines(state);
  settleDeaths(state);
}

function updateEntity(state: BattleState, e: Entity, dt: number, blocked: Uint8Array): void {
  e.cooldownMs = Math.max(0, e.cooldownMs - dt);
  e.repairCooldownMs = Math.max(0, e.repairCooldownMs - dt);
  if (e.kind === 'mine') return;

  const def = defOf(e);
  if (def.category === 'ability') return;
  if (e.disabledUntilMs > state.elapsedMs) return;

  if (def.repair && e.repairCooldownMs <= 0) {
    repairPulse(state, e);
    e.repairCooldownMs = def.repair.intervalMs;
  }

  const weapon = weaponOf(e);

  if (def.category === 'structure') {
    if (!weapon || e.cooldownMs > 0) return;
    const target = acquireTarget(state, e, weapon, weapon.range);
    e.targetId = target?.id ?? null;
    if (target) fire(state, e, target, weapon);
    return;
  }

  // Units: engage anything in detection range, otherwise advance on the enemy Headquarters.
  const acquireRange = weapon ? Math.max(def.detectionRange, weapon.range) : 0;
  const target = weapon ? acquireTarget(state, e, weapon, acquireRange) : null;
  e.targetId = target?.id ?? null;

  if (target && weapon && distance(e.pos, target.pos) <= weapon.range) {
    e.facing = angleFrom(e.pos, target.pos);
    if (e.cooldownMs <= 0) fire(state, e, target, weapon);
    return;
  }

  const goal = movementGoal(state, e, target);
  if (goal) moveAlong(e, goal, def.speed, dt, blocked);
}

/** Where a unit wants to go this tick. Null means hold position. */
function movementGoal(state: BattleState, e: Entity, target: Entity | null): Vec2 | null {
  if (target) return target.pos;

  const def = defOf(e);
  if (def.category === 'unit' && !def.weapon) {
    // Support units (e.g. Repair Vehicle) follow the nearest friendly armed unit.
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const f of state.entities.values()) {
      if (f.team !== e.team || f.id === e.id || f.kind !== 'unit' || f.hp <= 0 || !weaponOf(f)) continue;
      const d = distance(e.pos, f.pos);
      if (d < bestD) {
        best = f;
        bestD = d;
      }
    }
    if (best) return bestD <= 2.5 ? null : best.pos;
  }

  const hq = state.entities.get(state.teams[enemyOf(e.team)].hqId);
  return hq ? hq.pos : null;
}

function faceToward(e: Entity, from: Vec2, to: Vec2): void {
  if (distance(from, to) > 1e-6) e.facing = angleFrom(from, to);
}

function moveAlong(e: Entity, goal: Vec2, speed: number, dt: number, blocked: Uint8Array): void {
  if (distance(e.pos, goal) < 0.05) return;
  const step = (speed * dt) / 1000;

  if (e.layer === 'air') {
    stepDirect(e, goal, step);
    return;
  }

  e.repathInMs -= dt;
  const waypoint: Vec2 | undefined = e.path[e.pathIndex];
  const blockedAhead = waypoint !== undefined && blocked[cellIndex(cellOf(waypoint))] === 1;

  if (e.repathInMs <= 0 || blockedAhead) {
    const cells: Cell[] | null = findPath(blocked, cellOf(e.pos), cellOf(goal));
    e.repathInMs = 1000;
    if (cells === null) {
      e.path = [];
      e.pathIndex = 0;
      return; // Unreachable right now. Hold and try again next repath.
    }
    e.path = cells.map((c) => ({ x: c.x + 0.5, y: c.y + 0.5 }));
    e.pathIndex = 0;
  }

  const next: Vec2 | undefined = e.path[e.pathIndex];
  if (!next) {
    stepDirect(e, goal, step); // Already in the goal cell.
    return;
  }
  const moved = moveToward(e.pos, next, step);
  faceToward(e, e.pos, moved);
  e.pos = moved;
  if (distance(e.pos, next) < 0.01) e.pathIndex++;
}

function stepDirect(e: Entity, goal: Vec2, step: number): void {
  const moved = moveToward(e.pos, goal, step);
  faceToward(e, e.pos, moved);
  e.pos = moved;
}

function settleDeaths(state: BattleState): void {
  const now = state.elapsedMs;
  const destroyed: TeamId[] = [];

  for (const [id, e] of state.entities) {
    if (e.hp > 0) continue;
    if (e.kind !== 'mine' && e.lastDamagedBy && e.lastDamagedBy !== e.team) {
      const killer = state.teams[e.lastDamagedBy];
      killer.points = addPoints(killer.points, killReward(killKindOf(e), now));
    }
    if (isHeadquarters(e)) destroyed.push(e.team);
    state.entities.delete(id);
  }

  if (destroyed.length === 2) {
    state.winner = 'draw';
    state.endReason = 'hq_destroyed';
  } else if (destroyed.length === 1) {
    state.winner = winnerWhenHqDestroyed(destroyed[0]);
    state.endReason = 'hq_destroyed';
  }
}
