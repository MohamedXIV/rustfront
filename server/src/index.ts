// SpacetimeDB 2.x module. Owns the authoritative state. Clients send actions, never results.
// Stage 1: player profiles only. Match, room, card, and combat tables arrive in stage 2.
// Built against the spacetimedb 2.14 server SDK. Not yet published: the CLI is unavailable in this environment.
import { SenderError, schema, t, table } from 'spacetimedb/server';

const player = table(
  { name: 'player', public: true },
  {
    identity: t.identity().primaryKey(),
    displayName: t.string(),
    createdAt: t.timestamp(),
  },
);

const db = schema({ player });
export default db;

export const init = db.init((_ctx) => {
  // No seed data yet. Card definitions live in shared/data and are loaded by the match logic in stage 2.
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
