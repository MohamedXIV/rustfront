// Read-only lobby view derived from the subscribed rows. Scenes call this on every change.
import type { TeamId } from '../../shared/types';
import type { Session } from './session';

export interface LobbySeat {
  team: TeamId;
  name: string;
  ready: boolean;
  mine: boolean;
}

export type RoomStatus = 'lobby' | 'playing' | 'finished';

export interface LobbyState {
  displayName: string;
  /** This tab's seat, or null when it is not in a room. */
  mine: { team: TeamId; ready: boolean } | null;
  room: { code: string; status: RoomStatus } | null;
  /** Red first, then blue. */
  seats: LobbySeat[];
  /** Set while this player's battle is running. Null otherwise. */
  activeBattleId: bigint | null;
}

export function lobbyOf(session: Session): LobbyState {
  const { db } = session.conn;
  const me = session.identityHex;

  const names = new Map<string, string>();
  for (const p of db.player.iter()) names.set(p.identity.toHexString(), p.displayName);

  const seatRow = [...db.seat.iter()].find((s) => s.identity.toHexString() === me) ?? null;
  const roomRow = seatRow ? ([...db.room.iter()].find((r) => r.id === seatRow.roomId) ?? null) : null;

  // my_battle holds at most one row: this player's battle, with only their own points.
  const myBattle = [...db.myBattle.iter()][0] ?? null;
  const activeBattleId = roomRow && myBattle && myBattle.status === 'active' ? myBattle.id : null;

  const seats: LobbySeat[] = roomRow
    ? [...db.seat.iter()]
        .filter((s) => s.roomId === roomRow.id)
        .map((s) => {
          const hex = s.identity.toHexString();
          return {
            team: s.team as TeamId,
            name: names.get(hex) ?? 'Unknown',
            ready: s.ready,
            mine: hex === me,
          };
        })
        .sort((a, b) => (a.team === b.team ? 0 : a.team === 'red' ? -1 : 1))
    : [];

  return {
    displayName: names.get(me) ?? 'Connecting…',
    mine: seatRow ? { team: seatRow.team as TeamId, ready: seatRow.ready } : null,
    room: roomRow ? { code: roomRow.code, status: roomRow.status as RoomStatus } : null,
    seats,
    activeBattleId,
  };
}
