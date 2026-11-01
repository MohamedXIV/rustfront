// Authoritative battle state and the entry points that create it.
import { getDefinition } from '../data';
import { addPoints, passiveIncomePerWave, WAVE_INTERVAL_MS, WAVE_SIZE } from '../rules/economy';
import { EMPTY_HAND, receiveWave, type HandState } from '../rules/hand';
import { createRng, drawWave, type Rng } from '../rules/waves';
import type { CombatLayer, TeamId } from '../types';
import {
  cellOf,
  footprintCenter,
  HQ_ORIGIN,
  STARTING_POINTS,
  type Cell,
  type Footprint,
} from './arena';
import type { Vec2 } from './geometry';

export const TEAMS: readonly TeamId[] = ['red', 'blue'];

export type EntityKind = 'structure' | 'unit' | 'mine';

export interface Entity {
  id: number;
  team: TeamId;
  defId: string;
  kind: EntityKind;
  layer: CombatLayer;
  origin: Cell;
  footprint: Footprint;
  pos: Vec2;
  /** Radians. 0 points right, PI points left. Used for directional armor. */
  facing: number;
  hp: number;
  maxHp: number;
  cooldownMs: number;
  repairCooldownMs: number;
  disabledUntilMs: number;
  concealedUntilMs: number;
  targetId: number | null;
  path: Vec2[];
  pathIndex: number;
  repathInMs: number;
  lastDamagedBy: TeamId | null;
}

export interface PendingAbility {
  id: number;
  team: TeamId;
  defId: string;
  target: Vec2;
  resolveAtMs: number;
}

export interface TeamState {
  points: number;
  hand: HandState;
  hqId: number;
  waveIndex: number;
}

export interface BattleState {
  elapsedMs: number;
  nextWaveAtMs: number;
  nextId: number;
  entities: Map<number, Entity>;
  pending: PendingAbility[];
  teams: Record<TeamId, TeamState>;
  rng: Rng;
  winner: TeamId | 'draw' | null;
  endReason: 'hq_destroyed' | 'time_limit' | null;
}

export function teamFacing(team: TeamId): number {
  return team === 'red' ? 0 : Math.PI;
}

export interface SpawnSpec {
  team: TeamId;
  defId: string;
  kind: EntityKind;
  origin: Cell;
  /** Defaults to the center of the footprint. */
  pos?: Vec2;
}

export function spawnEntity(state: BattleState, spec: SpawnSpec): Entity {
  const def = getDefinition(spec.defId);
  if (def.category === 'ability') throw new Error(`Abilities are not entities: ${spec.defId}`);

  const footprint: Footprint = def.category === 'structure' ? def.footprint : { w: 1, h: 1 };
  const hp = spec.kind === 'mine' ? 1 : def.hp;
  const layer: CombatLayer = spec.kind === 'mine' ? 'ground' : def.layer;
  const pos = spec.pos ?? footprintCenter(spec.origin, footprint);

  const entity: Entity = {
    id: state.nextId++,
    team: spec.team,
    defId: spec.defId,
    kind: spec.kind,
    layer,
    origin: spec.kind === 'unit' ? cellOf(pos) : spec.origin,
    footprint,
    pos,
    facing: teamFacing(spec.team),
    hp,
    maxHp: hp,
    cooldownMs: 0,
    repairCooldownMs: 0,
    disabledUntilMs: 0,
    concealedUntilMs: 0,
    targetId: null,
    path: [],
    pathIndex: 0,
    repathInMs: 0,
    lastDamagedBy: null,
  };
  state.entities.set(entity.id, entity);
  return entity;
}

/**
 * Delivers one card wave to a team. Unplayed cards expire, the stored card survives.
 * Passive income is paid for every wave after the first.
 */
export function deliverWave(state: BattleState, team: TeamId, payIncome: boolean): void {
  const ts = state.teams[team];
  if (payIncome) ts.points = addPoints(ts.points, passiveIncomePerWave(state.elapsedMs));
  const cardIds = drawWave(state.rng, state.elapsedMs, WAVE_SIZE);
  const incoming = cardIds.map((cardId) => ({ instanceId: `${team}-${state.nextId++}`, cardId }));
  ts.hand = receiveWave(ts.hand, incoming).state;
  ts.waveIndex++;
}

export function createMatch(seed: number): BattleState {
  const state: BattleState = {
    elapsedMs: 0,
    nextWaveAtMs: WAVE_INTERVAL_MS,
    nextId: 1,
    entities: new Map(),
    pending: [],
    teams: {
      red: { points: STARTING_POINTS, hand: EMPTY_HAND, hqId: -1, waveIndex: 0 },
      blue: { points: STARTING_POINTS, hand: EMPTY_HAND, hqId: -1, waveIndex: 0 },
    },
    rng: createRng(seed),
    winner: null,
    endReason: null,
  };
  for (const team of TEAMS) {
    const hq = spawnEntity(state, { team, defId: 'headquarters', kind: 'structure', origin: HQ_ORIGIN[team] });
    state.teams[team].hqId = hq.id;
  }
  for (const team of TEAMS) deliverWave(state, team, false);
  return state;
}

export function hqHp(state: BattleState, team: TeamId): number {
  return state.entities.get(state.teams[team].hqId)?.hp ?? 0;
}
