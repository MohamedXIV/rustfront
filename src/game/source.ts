// What the battle screen needs from a match. The online source reads SpacetimeDB rows.
// The demo source runs the shared simulation in the browser. The screen cannot tell them apart.
import type { TeamId } from '../../shared/types';

export interface ViewEntity {
  id: number;
  team: TeamId;
  defId: string;
  /** 'structure' | 'unit' | 'mine' */
  kind: string;
  originX: number;
  originY: number;
  x: number;
  y: number;
  /** Radians. 0 points right, PI points left. */
  facing: number;
  hp: number;
  maxHp: number;
  disabledUntilMs: number;
  concealedUntilMs: number;
}

export interface ViewPending {
  id: number;
  team: TeamId;
  defId: string;
  x: number;
  y: number;
  resolveAtMs: number;
}

export interface ViewCard {
  instanceId: string;
  cardId: string;
  zone: 'hand' | 'stored';
  slot: number;
}

export interface BattleSnapshot {
  elapsedMs: number;
  nextWaveAtMs: number;
  ended: boolean;
  winner: TeamId | 'draw' | null;
  endReason: 'hq_destroyed' | 'time_limit' | null;
  /** The viewer's own points. The opponent's balance is private and is never sent to this client. */
  myPoints: number;
  /** Every entity the server publishes. The screen decides what to show (see view.isVisibleTo). */
  entities: ViewEntity[];
  pending: ViewPending[];
  /** The viewer's own cards only. */
  cards: ViewCard[];
}

export interface BattleSource {
  readonly mode: 'online' | 'demo';
  readonly myTeam: TeamId;
  /** Current state. Returns the same object until something changes, or null while loading. */
  snapshot(): BattleSnapshot | null;
  /** Called after every change. Returns an unsubscribe function. */
  onChange(listener: () => void): () => void;
  /** Resolves when the server accepts the play. Rejects with the reason otherwise. */
  play(instanceId: string, x: number, y: number): Promise<void>;
  /** Resolves when the server accepts the store. Rejects with the reason otherwise. */
  store(instanceId: string): Promise<void>;
  /** Releases listeners and timers. Does not leave the room. */
  dispose(): void;
}
