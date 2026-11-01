// Battle view over the SpacetimeDB rows of one battle. Rebuilds the snapshot only after a table changes.
import type { TeamId } from '../../shared/types';
import type { BattleSnapshot, BattleSource, ViewCard, ViewEntity, ViewPending } from '../game/source';
import type { Session } from './session';

export function openOnlineBattle(session: Session, battleId: bigint, myTeam: TeamId): BattleSource {
  return new OnlineBattle(session, battleId, myTeam);
}

class OnlineBattle implements BattleSource {
  readonly mode = 'online' as const;
  private cache: BattleSnapshot | null = null;
  private dirty = true;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribe: () => void;

  constructor(
    private readonly session: Session,
    private readonly battleId: bigint,
    readonly myTeam: TeamId,
  ) {
    this.unsubscribe = session.onChange(() => {
      this.dirty = true;
      for (const listener of [...this.listeners]) listener();
    });
  }

  snapshot(): BattleSnapshot | null {
    if (this.dirty) {
      this.cache = build(this.session, this.battleId);
      this.dirty = false;
    }
    return this.cache;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  play(instanceId: string, x: number, y: number): Promise<void> {
    return this.session.conn.reducers.playCard({ instanceId, x, y });
  }

  store(instanceId: string): Promise<void> {
    return this.session.conn.reducers.storeCard({ instanceId });
  }

  dispose(): void {
    this.unsubscribe();
    this.listeners.clear();
  }
}

function build(session: Session, battleId: bigint): BattleSnapshot | null {
  const { db } = session.conn;
  const battle = [...db.battle.iter()].find((row) => row.id === battleId);
  if (!battle) return null;

  const entities: ViewEntity[] = [];
  for (const e of db.entity.iter()) {
    if (e.battleId !== battleId) continue;
    entities.push({
      id: e.id,
      team: e.team as TeamId,
      defId: e.defId,
      kind: e.kind,
      originX: e.originX,
      originY: e.originY,
      x: e.posX,
      y: e.posY,
      facing: e.facing,
      hp: e.hp,
      maxHp: e.maxHp,
      disabledUntilMs: e.disabledUntilMs,
      concealedUntilMs: e.concealedUntilMs,
    });
  }

  const pending: ViewPending[] = [];
  for (const p of db.pendingAbility.iter()) {
    if (p.battleId !== battleId) continue;
    pending.push({
      id: p.id,
      team: p.team as TeamId,
      defId: p.defId,
      x: p.targetX,
      y: p.targetY,
      resolveAtMs: p.resolveAtMs,
    });
  }

  // my_hand already holds only this player's cards. The battle filter guards against a stale battle.
  const cards: ViewCard[] = [];
  for (const c of db.myHand.iter()) {
    if (c.battleId !== battleId) continue;
    cards.push({
      instanceId: c.instanceId,
      cardId: c.cardId,
      zone: c.zone === 'stored' ? 'stored' : 'hand',
      slot: c.slot,
    });
  }

  return {
    elapsedMs: battle.elapsedMs,
    nextWaveAtMs: battle.nextWaveAtMs,
    ended: battle.status === 'ended',
    winner: battle.winner === '' ? null : (battle.winner as TeamId | 'draw'),
    endReason: battle.endReason === '' ? null : (battle.endReason as 'hq_destroyed' | 'time_limit'),
    points: { red: battle.redPoints, blue: battle.bluePoints },
    entities,
    pending,
    cards,
  };
}
