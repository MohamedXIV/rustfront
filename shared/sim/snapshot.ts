// Converts a battle to flat rows and back. The server stores these rows. Restoring them must continue
// the battle exactly as an uninterrupted run would, so every field the simulation reads is kept.
import { restoreRng } from '../rules/waves';
import type { CardInstance, CombatLayer, TeamId } from '../types';
import { TEAMS, type BattleState, type Entity, type EntityKind, type PendingAbility, type TeamState } from './state';

export interface MatchRow {
  elapsedMs: number;
  nextWaveAtMs: number;
  nextId: number;
  rngState: number;
  redPoints: number;
  bluePoints: number;
  redWaveIndex: number;
  blueWaveIndex: number;
  redHqId: number;
  blueHqId: number;
  /** Empty string while the match runs. */
  winner: string;
  /** Empty string while the match runs. */
  endReason: string;
}

/** Public entity fields. Clients may read these. */
export interface EntityRow {
  id: number;
  team: string;
  defId: string;
  kind: string;
  layer: string;
  originX: number;
  originY: number;
  posX: number;
  posY: number;
  facing: number;
  hp: number;
  maxHp: number;
  disabledUntilMs: number;
  concealedUntilMs: number;
}

/** Simulation-only entity fields. Never sent to clients. */
export interface EntityAiRow {
  entityId: number;
  footprintW: number;
  footprintH: number;
  cooldownMs: number;
  repairCooldownMs: number;
  /** -1 when there is no target. */
  targetId: number;
  pathJson: string;
  pathIndex: number;
  repathInMs: number;
  /** Empty string when nothing has damaged the entity. */
  lastDamagedBy: string;
}

/** Card instances. Private: only the owning team can read them, through a view. */
export interface CardRow {
  instanceId: string;
  team: string;
  cardId: string;
  /** 'hand' or 'stored'. */
  zone: string;
  /** Position within the hand. Always 0 for the stored card. */
  slot: number;
}

export interface PendingRow {
  id: number;
  team: string;
  defId: string;
  targetX: number;
  targetY: number;
  resolveAtMs: number;
}

export interface BattleRows {
  match: MatchRow;
  entities: EntityRow[];
  entityAi: EntityAiRow[];
  cards: CardRow[];
  pending: PendingRow[];
}

const NO_TARGET = -1;

export function battleRows(state: BattleState): BattleRows {
  const entities = [...state.entities.values()].sort((a, b) => a.id - b.id);
  const cards: CardRow[] = [];
  for (const team of TEAMS) {
    const hand = state.teams[team].hand;
    hand.hand.forEach((c, slot) => cards.push({ instanceId: c.instanceId, team, cardId: c.cardId, zone: 'hand', slot }));
    if (hand.stored) {
      cards.push({ instanceId: hand.stored.instanceId, team, cardId: hand.stored.cardId, zone: 'stored', slot: 0 });
    }
  }
  return {
    match: {
      elapsedMs: state.elapsedMs,
      nextWaveAtMs: state.nextWaveAtMs,
      nextId: state.nextId,
      rngState: state.rng.state(),
      redPoints: state.teams.red.points,
      bluePoints: state.teams.blue.points,
      redWaveIndex: state.teams.red.waveIndex,
      blueWaveIndex: state.teams.blue.waveIndex,
      redHqId: state.teams.red.hqId,
      blueHqId: state.teams.blue.hqId,
      winner: state.winner ?? '',
      endReason: state.endReason ?? '',
    },
    entities: entities.map(entityRow),
    entityAi: entities.map(entityAiRow),
    cards,
    pending: state.pending.map((p) => ({
      id: p.id,
      team: p.team,
      defId: p.defId,
      targetX: p.target.x,
      targetY: p.target.y,
      resolveAtMs: p.resolveAtMs,
    })),
  };
}

export function battleFromRows(rows: BattleRows): BattleState {
  const m = rows.match;
  const ai = new Map(rows.entityAi.map((r) => [r.entityId, r]));

  const entities = new Map<number, Entity>();
  for (const r of [...rows.entities].sort((a, b) => a.id - b.id)) {
    const a = ai.get(r.id);
    if (!a) throw new Error(`Entity ${r.id} has no simulation row`);
    entities.set(r.id, {
      id: r.id,
      team: r.team as TeamId,
      defId: r.defId,
      kind: r.kind as EntityKind,
      layer: r.layer as CombatLayer,
      origin: { x: r.originX, y: r.originY },
      footprint: { w: a.footprintW, h: a.footprintH },
      pos: { x: r.posX, y: r.posY },
      facing: r.facing,
      hp: r.hp,
      maxHp: r.maxHp,
      cooldownMs: a.cooldownMs,
      repairCooldownMs: a.repairCooldownMs,
      disabledUntilMs: r.disabledUntilMs,
      concealedUntilMs: r.concealedUntilMs,
      targetId: a.targetId === NO_TARGET ? null : a.targetId,
      path: (JSON.parse(a.pathJson) as [number, number][]).map(([x, y]) => ({ x, y })),
      pathIndex: a.pathIndex,
      repathInMs: a.repathInMs,
      lastDamagedBy: a.lastDamagedBy === '' ? null : (a.lastDamagedBy as TeamId),
    });
  }

  const pending: PendingAbility[] = [...rows.pending]
    .sort((a, b) => a.id - b.id)
    .map((p) => ({
      id: p.id,
      team: p.team as TeamId,
      defId: p.defId,
      target: { x: p.targetX, y: p.targetY },
      resolveAtMs: p.resolveAtMs,
    }));

  const hands = {
    red: { hand: [] as CardInstance[], stored: null as CardInstance | null },
    blue: { hand: [] as CardInstance[], stored: null as CardInstance | null },
  };
  for (const c of [...rows.cards].sort((a, b) => a.slot - b.slot)) {
    const bucket = hands[c.team as TeamId];
    const card: CardInstance = { instanceId: c.instanceId, cardId: c.cardId };
    if (c.zone === 'stored') bucket.stored = card;
    else bucket.hand.push(card);
  }

  const team = (side: TeamId, points: number, waveIndex: number, hqId: number): TeamState => ({
    points,
    hqId,
    waveIndex,
    hand: { hand: hands[side].hand, stored: hands[side].stored },
  });

  return {
    elapsedMs: m.elapsedMs,
    nextWaveAtMs: m.nextWaveAtMs,
    nextId: m.nextId,
    entities,
    pending,
    teams: {
      red: team('red', m.redPoints, m.redWaveIndex, m.redHqId),
      blue: team('blue', m.bluePoints, m.blueWaveIndex, m.blueHqId),
    },
    rng: restoreRng(m.rngState),
    winner: m.winner === '' ? null : (m.winner as TeamId | 'draw'),
    endReason: m.endReason === '' ? null : (m.endReason as BattleState['endReason']),
  };
}

function entityRow(e: Entity): EntityRow {
  return {
    id: e.id,
    team: e.team,
    defId: e.defId,
    kind: e.kind,
    layer: e.layer,
    originX: e.origin.x,
    originY: e.origin.y,
    posX: e.pos.x,
    posY: e.pos.y,
    facing: e.facing,
    hp: e.hp,
    maxHp: e.maxHp,
    disabledUntilMs: e.disabledUntilMs,
    concealedUntilMs: e.concealedUntilMs,
  };
}

function entityAiRow(e: Entity): EntityAiRow {
  return {
    entityId: e.id,
    footprintW: e.footprint.w,
    footprintH: e.footprint.h,
    cooldownMs: e.cooldownMs,
    repairCooldownMs: e.repairCooldownMs,
    targetId: e.targetId ?? NO_TARGET,
    pathJson: JSON.stringify(e.path.map((p) => [p.x, p.y])),
    pathIndex: e.pathIndex,
    repathInMs: e.repathInMs,
    lastDamagedBy: e.lastDamagedBy ?? '',
  };
}
