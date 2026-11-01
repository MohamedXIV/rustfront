// SpacetimeDB 2.x module. Owns the authoritative state. Clients send actions, never results.
//
// Each battle is stored as rows. Every reducer and the scheduled tick rebuild the battle from those rows,
// run the shared simulation, and write back only what changed. Hands are private and reach their owner
// through the my_hand view. Rows that exist per battle use string keys so that battles never collide.
import { ScheduleAt, SenderError, schema, t, table, type Random, type ReducerCtx } from 'spacetimedb/server';
import { getCard } from '../../shared/data';
import {
  battleFromRows,
  battleRows,
  cellOf,
  createMatch,
  stepBattle,
  TICK_MS,
  tryPlayCard,
  tryStoreCard,
  type BattleRows,
  type BattleState,
  type PlayAction,
} from '../../shared/sim';
import type { CardInstance, TeamId } from '../../shared/types';

const player = table(
  { name: 'player', public: true },
  {
    identity: t.identity().primaryKey(),
    displayName: t.string(),
    createdAt: t.timestamp(),
  },
);

/** A lobby. Holds up to two seats. battleId is 0 until the battle starts. */
const room = table(
  { name: 'room', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    code: t.string().unique(),
    status: t.string(), // 'lobby' | 'playing' | 'finished'
    battleId: t.u64(),
  },
);

const seat = table(
  { name: 'seat', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64().index('btree'),
    identity: t.identity().unique(),
    team: t.string(),
    ready: t.bool(),
  },
);

const battle = table(
  { name: 'battle', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64().index('btree'),
    status: t.string(), // 'active' | 'ended'
    elapsedMs: t.f64(),
    nextWaveAtMs: t.f64(),
    nextId: t.u32(),
    rngState: t.u32(),
    redPoints: t.f64(),
    bluePoints: t.f64(),
    redWaveIndex: t.u32(),
    blueWaveIndex: t.u32(),
    redHqId: t.u32(),
    blueHqId: t.u32(),
    winner: t.string(), // '' while running
    endReason: t.string(), // '' while running
  },
);

const entity = table(
  { name: 'entity', public: true },
  {
    key: t.string().primaryKey(), // `${battleId}:${id}`
    battleId: t.u64().index('btree'),
    id: t.u32(),
    team: t.string(),
    defId: t.string(),
    kind: t.string(),
    layer: t.string(),
    originX: t.u32(),
    originY: t.u32(),
    posX: t.f64(),
    posY: t.f64(),
    facing: t.f64(),
    hp: t.f64(),
    maxHp: t.f64(),
    disabledUntilMs: t.f64(),
    concealedUntilMs: t.f64(),
  },
);

/** Simulation-only entity state. Private. */
const entityAi = table(
  { name: 'entity_ai' },
  {
    key: t.string().primaryKey(),
    battleId: t.u64().index('btree'),
    entityId: t.u32(),
    footprintW: t.u32(),
    footprintH: t.u32(),
    cooldownMs: t.f64(),
    repairCooldownMs: t.f64(),
    targetId: t.i32(),
    pathJson: t.string(),
    pathIndex: t.u32(),
    repathInMs: t.f64(),
    lastDamagedBy: t.string(),
  },
);

const pendingAbility = table(
  { name: 'pending_ability', public: true },
  {
    key: t.string().primaryKey(),
    battleId: t.u64().index('btree'),
    id: t.u32(),
    team: t.string(),
    defId: t.string(),
    targetX: t.f64(),
    targetY: t.f64(),
    resolveAtMs: t.f64(),
  },
);

/** Card instances. Private. Players see only their own team's cards, through my_hand. */
const cardRow = t.row({
  key: t.string().primaryKey(), // `${battleId}:${instanceId}`
  battleId: t.u64().index('btree'),
  instanceId: t.string(),
  team: t.string(),
  cardId: t.string(),
  zone: t.string(), // 'hand' | 'stored'
  slot: t.u32(),
});
const card = table({ name: 'card' }, cardRow);

/** Schedule rows. The tick reducer below is bound to this table through onSchedule. */
const tickSchedule = table(
  { name: 'tick_schedule' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  },
);

const db = schema({
  player,
  room,
  seat,
  battle,
  entity,
  entityAi,
  pendingAbility,
  card,
  tickSchedule,
});
export default db;

type Ctx = ReducerCtx<typeof db.schemaType>;

const TICK_MICROS = BigInt(TICK_MS) * 1000n;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // No look-alikes: no 0/O, 1/I.

export const init = db.init((ctx) => {
  ctx.db.tickSchedule.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(TICK_MICROS) });
});

export const onConnect = db.clientConnected((ctx) => {
  // Create a guest profile the first time an identity connects.
  if (ctx.db.player.identity.find(ctx.sender)) return;
  ctx.db.player.insert({
    identity: ctx.sender,
    displayName: `Guest ${ctx.sender.toHexString().slice(0, 6)}`,
    createdAt: ctx.timestamp,
  });
});

export const setDisplayName = db.reducer({ name: t.string() }, (ctx, { name }) => {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 16) {
    throw new SenderError('Display name must be 2 to 16 characters');
  }
  const row = ctx.db.player.identity.find(ctx.sender);
  if (!row) throw new SenderError('Player profile not found');
  ctx.db.player.identity.update({ ...row, displayName: trimmed });
});

export const createRoom = db.reducer({}, (ctx) => {
  if (!ctx.db.player.identity.find(ctx.sender)) throw new SenderError('Player profile not found');
  if (ctx.db.seat.identity.find(ctx.sender)) throw new SenderError('You are already in a room');
  let code = randomCode(ctx.random);
  while (ctx.db.room.code.find(code)) code = randomCode(ctx.random);
  const created = ctx.db.room.insert({ id: 0n, code, status: 'lobby', battleId: 0n });
  ctx.db.seat.insert({ id: 0n, roomId: created.id, identity: ctx.sender, team: 'red', ready: false });
});

export const joinRoom = db.reducer({ code: t.string() }, (ctx, { code }) => {
  if (!ctx.db.player.identity.find(ctx.sender)) throw new SenderError('Player profile not found');
  if (ctx.db.seat.identity.find(ctx.sender)) throw new SenderError('You are already in a room');
  const found = ctx.db.room.code.find(code.trim().toUpperCase());
  if (!found) throw new SenderError('No room with that code');
  if (found.status !== 'lobby') throw new SenderError('That room has already started');
  if ([...ctx.db.seat.roomId.filter(found.id)].length >= 2) throw new SenderError('That room is full');
  ctx.db.seat.insert({ id: 0n, roomId: found.id, identity: ctx.sender, team: 'blue', ready: false });
});

export const setReady = db.reducer({ ready: t.bool() }, (ctx, { ready }) => {
  const mine = seatOf(ctx);
  const room = ctx.db.room.id.find(mine.roomId);
  if (!room || room.status !== 'lobby') throw new SenderError('The battle has already started');
  ctx.db.seat.id.update({ ...mine, ready });
  const seats = [...ctx.db.seat.roomId.filter(room.id)];
  const everyoneReady = seats.length === 2 && seats.every((s) => (s.id === mine.id ? ready : s.ready));
  if (everyoneReady) startBattle(ctx, room.id);
});

export const playCard = db.reducer(
  { instanceId: t.string(), x: t.f64(), y: t.f64() },
  (ctx, { instanceId, x, y }) => {
    const { mine, battleId } = activeBattleOf(ctx);
    const state = loadBattle(ctx, battleId);
    const team = mine.team as TeamId;
    const held = cardOf(state, team, instanceId);
    if (!held) throw new SenderError('That card is not available to you');

    const category = getCard(held.cardId).category;
    const action: PlayAction =
      category === 'structure'
        ? { kind: 'structure', instanceId, origin: cellOf({ x, y }) }
        : { kind: category, instanceId, pos: { x, y } };

    const result = tryPlayCard(state, team, action);
    if (!result.ok) throw new SenderError(result.reason);
    saveBattle(ctx, battleId, state);
  },
);

export const storeCard = db.reducer({ instanceId: t.string() }, (ctx, { instanceId }) => {
  const { mine, battleId } = activeBattleOf(ctx);
  const state = loadBattle(ctx, battleId);
  const result = tryStoreCard(state, mine.team as TeamId, instanceId);
  if (!result.ok) throw new SenderError(result.reason);
  saveBattle(ctx, battleId, state);
});

/** Advances every running battle by one tick. Scheduled, so it runs on the server clock. */
export const tick = db.reducer({ onSchedule: tickSchedule }, { scheduled: tickSchedule.rowType }, (ctx, _args) => {
  for (const b of [...ctx.db.battle.iter()]) {
    if (b.status !== 'active') continue;
    const state = loadBattle(ctx, b.id);
    stepBattle(state, TICK_MS);
    saveBattle(ctx, b.id, state);
  }
});

/** The caller's own cards in the current battle. Other players' cards are never visible. */
export const myHand = db.view({ name: 'my_hand', public: true }, t.array(cardRow), (ctx) => {
  const mine = ctx.db.seat.identity.find(ctx.sender);
  if (!mine) return [];
  const lobby = ctx.db.room.id.find(mine.roomId);
  if (!lobby || lobby.battleId === 0n) return [];
  return [...ctx.db.card.battleId.filter(lobby.battleId)].filter((c) => c.team === mine.team);
});

function seatOf(ctx: Ctx) {
  const mine = ctx.db.seat.identity.find(ctx.sender);
  if (!mine) throw new SenderError('Join a room first');
  return mine;
}

function activeBattleOf(ctx: Ctx) {
  const mine = seatOf(ctx);
  const lobby = ctx.db.room.id.find(mine.roomId);
  if (!lobby || lobby.battleId === 0n) throw new SenderError('The battle has not started');
  return { mine, battleId: lobby.battleId };
}

function randomCode(random: Random): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[random.integerInRange(0, CODE_ALPHABET.length - 1)];
  return code;
}

function startBattle(ctx: Ctx, roomId: bigint): void {
  const room = ctx.db.room.id.find(roomId);
  if (!room) return;
  const seed = ctx.random.integerInRange(1, 0x7fffffff);
  const state = createMatch(seed);
  const rows = battleRows(state);
  const created = ctx.db.battle.insert({ id: 0n, roomId, status: 'active', ...rows.match });
  ctx.db.room.id.update({ ...room, status: 'playing', battleId: created.id });
  saveBattle(ctx, created.id, state);
}

function cardOf(state: BattleState, team: TeamId, instanceId: string): CardInstance | undefined {
  const hand = state.teams[team].hand;
  if (hand.stored?.instanceId === instanceId) return hand.stored;
  return hand.hand.find((c) => c.instanceId === instanceId);
}

function loadBattle(ctx: Ctx, battleId: bigint): BattleState {
  const b = ctx.db.battle.id.find(battleId);
  if (!b) throw new SenderError('Battle not found');
  const rows: BattleRows = {
    match: b,
    entities: [...ctx.db.entity.battleId.filter(battleId)],
    entityAi: [...ctx.db.entityAi.battleId.filter(battleId)],
    cards: [...ctx.db.card.battleId.filter(battleId)],
    pending: [...ctx.db.pendingAbility.battleId.filter(battleId)],
  };
  return battleFromRows(rows);
}

function saveBattle(ctx: Ctx, battleId: bigint, state: BattleState): void {
  const rows = battleRows(state);
  const b = ctx.db.battle.id.find(battleId);
  if (!b) throw new SenderError('Battle not found');
  const ended = state.winner !== null;
  ctx.db.battle.id.update({ ...b, ...rows.match, status: ended ? 'ended' : 'active' });

  syncEntities(ctx, battleId, rows);
  syncCards(ctx, battleId, rows);
  syncPending(ctx, battleId, rows);

  if (ended) {
    const lobby = ctx.db.room.id.find(b.roomId);
    if (lobby) ctx.db.room.id.update({ ...lobby, status: 'finished' });
  }
}

function syncEntities(ctx: Ctx, battleId: bigint, rows: BattleRows): void {
  const oldPublic = new Map([...ctx.db.entity.battleId.filter(battleId)].map((r) => [r.id, r]));
  const oldAi = new Map([...ctx.db.entityAi.battleId.filter(battleId)].map((r) => [r.entityId, r]));

  for (const e of rows.entities) {
    const row = { key: `${battleId}:${e.id}`, battleId, ...e };
    const prev = oldPublic.get(e.id);
    if (!prev) ctx.db.entity.insert(row);
    else if (changed(prev, row)) ctx.db.entity.key.update(row);
    oldPublic.delete(e.id);
  }
  for (const stale of oldPublic.values()) ctx.db.entity.key.delete(stale.key);

  for (const a of rows.entityAi) {
    const row = { key: `${battleId}:${a.entityId}`, battleId, ...a };
    const prev = oldAi.get(a.entityId);
    if (!prev) ctx.db.entityAi.insert(row);
    else if (changed(prev, row)) ctx.db.entityAi.key.update(row);
    oldAi.delete(a.entityId);
  }
  for (const stale of oldAi.values()) ctx.db.entityAi.key.delete(stale.key);
}

function syncCards(ctx: Ctx, battleId: bigint, rows: BattleRows): void {
  const old = new Map([...ctx.db.card.battleId.filter(battleId)].map((r) => [r.key, r]));
  for (const c of rows.cards) {
    const row = { key: `${battleId}:${c.instanceId}`, battleId, ...c };
    const prev = old.get(row.key);
    if (!prev) ctx.db.card.insert(row);
    else if (changed(prev, row)) ctx.db.card.key.update(row);
    old.delete(row.key);
  }
  for (const stale of old.values()) ctx.db.card.key.delete(stale.key);
}

function syncPending(ctx: Ctx, battleId: bigint, rows: BattleRows): void {
  const old = new Map([...ctx.db.pendingAbility.battleId.filter(battleId)].map((r) => [r.id, r]));
  for (const p of rows.pending) {
    const row = { key: `${battleId}:${p.id}`, battleId, ...p };
    const prev = old.get(p.id);
    if (!prev) ctx.db.pendingAbility.insert(row);
    else if (changed(prev, row)) ctx.db.pendingAbility.key.update(row);
    old.delete(p.id);
  }
  for (const stale of old.values()) ctx.db.pendingAbility.key.delete(stale.key);
}

/** True when any field in `next` differs from `prev`. Avoids writing rows that did not change. */
function changed(prev: object, next: object): boolean {
  const a = prev as Record<string, unknown>;
  const b = next as Record<string, unknown>;
  return Object.keys(b).some((k) => a[k] !== b[k]);
}
