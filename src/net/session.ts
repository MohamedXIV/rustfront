// The one connection to the SpacetimeDB module for this tab. The identity token lives in localStorage,
// so a reload reattaches to the same player, seat and battle. Add ?reset to the URL to forget it.
import { SPACETIME_DB, SPACETIME_URI } from '../config';
import { DbConnection } from '../module_bindings';

/** Every public table, plus the caller's private hand. Each query must parse on the server. */
const SUBSCRIPTIONS = [
  'SELECT * FROM player',
  'SELECT * FROM room',
  'SELECT * FROM seat',
  'SELECT * FROM battle',
  'SELECT * FROM entity',
  'SELECT * FROM pending_ability',
  'SELECT * FROM my_hand',
];

const TOKEN_KEY = `rustfront:token:${SPACETIME_DB}`;

export interface Session {
  readonly conn: DbConnection;
  /** Hex identity of this tab's player. Matches seat.identity. */
  readonly identityHex: string;
  isConnected(): boolean;
  /** Called after table changes. Changes within one JavaScript task are batched into one call. */
  onChange(listener: () => void): () => void;
}

/** The part of a generated table handle this module needs. */
interface Hookable {
  onInsert(cb: () => void): void;
  onUpdate(cb: () => void): void;
  onDelete(cb: () => void): void;
}

let connecting: Promise<Session> | null = null;
let current: Session | null = null;

/** Connects once per tab and resolves after the subscriptions are applied. A failed attempt can be retried. */
export function connectSession(): Promise<Session> {
  if (new URLSearchParams(window.location.search).has('reset')) clearToken();
  connecting ??= open().then(
    (session) => {
      current = session;
      return session;
    },
    (err: unknown) => {
      connecting = null;
      throw err;
    },
  );
  return connecting;
}

/** The connected session, or null before connectSession() has resolved. */
export function currentSession(): Session | null {
  return current;
}

function open(): Promise<Session> {
  return new Promise<Session>((resolve, reject) => {
    const listeners = new Set<() => void>();
    let queued = false;
    let connected = false;

    const flush = () => {
      queued = false;
      for (const listener of [...listeners]) listener();
    };
    const changed = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(flush);
    };

    DbConnection.builder()
      .withUri(SPACETIME_URI)
      .withDatabaseName(SPACETIME_DB)
      .withToken(readToken())
      .onConnect((conn, identity, token) => {
        writeToken(token);
        hook(conn.db.player, changed);
        hook(conn.db.room, changed);
        hook(conn.db.seat, changed);
        hook(conn.db.battle, changed);
        hook(conn.db.entity, changed);
        hook(conn.db.pendingAbility, changed);
        hook(conn.db.myHand, changed);

        conn.subscriptionBuilder()
          .onApplied(() => {
            connected = true;
            const session: Session = {
              conn,
              identityHex: identity.toHexString(),
              isConnected: () => connected,
              onChange(listener) {
                listeners.add(listener);
                return () => {
                  listeners.delete(listener);
                };
              },
            };
            resolve(session);
          })
          .onError(() => reject(new Error('The server rejected the subscriptions. Check the module is published.')))
          .subscribe(SUBSCRIPTIONS);
      })
      .onConnectError((_ctx, err) => reject(err))
      .onDisconnect(() => {
        connected = false;
        changed();
      })
      .build();
  });
}

function hook(table: Hookable, notify: () => void): void {
  table.onInsert(notify);
  table.onUpdate(notify);
  table.onDelete(notify);
}

function readToken(): string | undefined {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    // Storage can be blocked (private windows, strict settings). The session still works, but a reload gets a new identity.
    return undefined;
  }
}

function writeToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* Storage blocked. Nothing else depends on it. */
  }
}

function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* Storage blocked. Nothing to clear. */
  }
}
