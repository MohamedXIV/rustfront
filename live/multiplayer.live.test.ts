// Live test. Needs a running SpacetimeDB server with the module published as `rustfront-ci`
// and client bindings generated into src/module_bindings. The CI spacetime job does both.
// Two real clients play a short battle through the reducers and views. Not part of `npm test`.
import { describe, expect, it } from 'vitest';
import { DbConnection } from '../src/module_bindings';
import { getCard } from '../shared/data';

const URI = 'ws://127.0.0.1:3000';
const DATABASE = 'rustfront-ci';
const POLL_MS = 100;

interface Client {
  conn: DbConnection;
  hex: string;
}

async function connect(): Promise<Client> {
  return new Promise<Client>((resolve, reject) => {
    DbConnection.builder()
      .withUri(URI)
      .withDatabaseName(DATABASE)
      .onConnect((c, identity) => resolve({ conn: c, hex: identity.toHexString() }))
      .onConnectError((_ctx, err) => reject(err))
      .build();
  });
}

async function subscribe(conn: DbConnection): Promise<void> {
  await new Promise<void>((resolve) => {
    conn.subscriptionBuilder()
      .onApplied(() => resolve())
      .subscribe([
        'SELECT * FROM player',
        'SELECT * FROM room',
        'SELECT * FROM seat',
        'SELECT * FROM battle',
        'SELECT * FROM entity',
        'SELECT * FROM pending_ability',
        'SELECT * FROM my_hand',
      ]);
  });
}

/** Polls until read() returns a truthy value. Fails with the label if the time runs out. */
async function waitFor<T>(label: string, read: () => T | undefined | null | false, timeoutMs = 30_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = read();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

describe('two players, one battle', () => {
  it('runs the lobby, ticks the battle, plays and stores cards, and keeps hands private', async () => {
    const red = await connect();
    const blue = await connect();
    await Promise.all([subscribe(red.conn), subscribe(blue.conn)]);

    try {
      const seatOf = (c: Client) => [...c.conn.db.seat.iter()].find((s) => s.identity.toHexString() === c.hex);
      const myCards = (c: Client) => [...c.conn.db.myHand.iter()];
      const redUnits = () =>
        [...red.conn.db.entity.iter()].filter((e) => e.team === 'red' && e.kind === 'unit').length;

      // Lobby: red creates, blue joins by code, both ready up.
      await red.conn.reducers.createRoom({});
      const redSeat = await waitFor('red seat', () => seatOf(red));
      const room = await waitFor('room', () => [...red.conn.db.room.iter()].find((r) => r.id === redSeat.roomId));
      expect(room.code).toHaveLength(6);

      await blue.conn.reducers.joinRoom({ code: room.code });
      const blueSeat = await waitFor('blue seat', () => seatOf(blue));
      expect(blueSeat.roomId).toBe(room.id);
      expect(blueSeat.team).toBe('blue');

      await red.conn.reducers.setReady({ ready: true });
      await blue.conn.reducers.setReady({ ready: true });
      const battle = await waitFor('battle', () =>
        [...red.conn.db.battle.iter()].find((b) => b.roomId === room.id),
      );
      expect(battle.status).toBe('active');

      // Hands: each player sees only their own team's cards.
      const redHand = await waitFor('red hand', () => {
        const h = myCards(red);
        return h.length > 0 ? h : undefined;
      });
      const blueHand = await waitFor('blue hand', () => {
        const h = myCards(blue);
        return h.length > 0 ? h : undefined;
      });
      expect(redHand.every((c) => c.team === 'red')).toBe(true);
      expect(blueHand.every((c) => c.team === 'blue')).toBe(true);

      // Play a unit. Waves arrive every 20 s, so wait for a unit card to show up.
      const unit = await waitFor(
        'a unit card in red hand',
        () => myCards(red).find((c) => getCard(c.cardId).category === 'unit'),
        90_000,
      );
      const unitsBefore = redUnits();
      await red.conn.reducers.playCard({ instanceId: unit.instanceId, x: 12.5, y: 19.5 });
      await waitFor('red unit deployed', () => redUnits() > unitsBefore);

      // Another player cannot play a card they do not hold.
      const leftover = myCards(red).find((c) => c.instanceId !== unit.instanceId);
      expect(leftover).toBeDefined();
      const unitsAfter = redUnits();
      await expect(
        blue.conn.reducers.playCard({ instanceId: leftover!.instanceId, x: 51.5, y: 19.5 }),
      ).rejects.toThrow(/not available/);
      await new Promise((r) => setTimeout(r, 1000));
      expect(redUnits()).toBe(unitsAfter);
      expect(myCards(blue).some((c) => c.instanceId === leftover!.instanceId)).toBe(false);

      // Store a card. It moves to the stored zone and stays visible to its owner only.
      await red.conn.reducers.storeCard({ instanceId: leftover!.instanceId });
      await waitFor('stored card', () =>
        myCards(red).find((c) => c.instanceId === leftover!.instanceId && c.zone === 'stored'),
      );

      // The battle ticks and both Headquarters are on the board.
      await waitFor('battle ticking', () => {
        const b = [...red.conn.db.battle.iter()].find((x) => x.id === battle.id);
        return b && b.elapsedMs >= 3000 ? b : undefined;
      });
      const headquarters = [...red.conn.db.entity.iter()].filter(
        (e) => e.kind === 'structure' && e.defId === 'headquarters',
      );
      expect(headquarters.map((h) => h.team).sort()).toEqual(['blue', 'red']);
      expect(headquarters.every((h) => h.hp > 0)).toBe(true);
    } finally {
      red.conn.disconnect();
      blue.conn.disconnect();
    }
  }, 180_000);
});
