// Offline demo. Runs the shared simulation in the browser and plays the blue side with a simple bot.
// The red side is the player, through the same tryPlayCard and tryStoreCard the server uses.
import { getCard } from '../../shared/data';
import { createRng, type Rng } from '../../shared/rules/waves';
import {
  createMatch,
  HQ_ORIGIN,
  cellOf,
  stepBattle,
  TICK_MS,
  tryPlayCard,
  tryStoreCard,
  type BattleState,
  type PlayAction,
} from '../../shared/sim';
import type { CardCategory, TeamId } from '../../shared/types';
import type { BattleSnapshot, BattleSource, ViewCard, ViewEntity, ViewPending } from './source';

const BOT_EVERY_TICKS = 30; // Three seconds of game time between bot turns.
const BOT_ATTEMPTS = 40; // Random spots tried per card before the bot gives up on it.

export function viewEntitiesOf(state: BattleState): ViewEntity[] {
  return [...state.entities.values()].map((e) => ({
    id: e.id,
    team: e.team,
    defId: e.defId,
    kind: e.kind,
    originX: e.origin.x,
    originY: e.origin.y,
    x: e.pos.x,
    y: e.pos.y,
    facing: e.facing,
    hp: e.hp,
    maxHp: e.maxHp,
    disabledUntilMs: e.disabledUntilMs,
    concealedUntilMs: e.concealedUntilMs,
  }));
}

export function snapshotOf(state: BattleState, viewer: TeamId): BattleSnapshot {
  const pending: ViewPending[] = state.pending.map((p) => ({
    id: p.id,
    team: p.team,
    defId: p.defId,
    x: p.target.x,
    y: p.target.y,
    resolveAtMs: p.resolveAtMs,
  }));
  const hand = state.teams[viewer].hand;
  const cards: ViewCard[] = hand.hand.map((c, slot) => ({ instanceId: c.instanceId, cardId: c.cardId, zone: 'hand', slot }));
  if (hand.stored) cards.push({ instanceId: hand.stored.instanceId, cardId: hand.stored.cardId, zone: 'stored', slot: 0 });

  return {
    elapsedMs: state.elapsedMs,
    nextWaveAtMs: state.nextWaveAtMs,
    ended: state.winner !== null,
    winner: state.winner,
    endReason: state.endReason,
    myPoints: state.teams[viewer].points,
    entities: viewEntitiesOf(state),
    pending,
    cards,
  };
}

export class LocalBattle implements BattleSource {
  readonly mode = 'demo' as const;
  readonly myTeam: TeamId = 'red';
  private readonly state: BattleState;
  private readonly bot: Rng;
  private snap: BattleSnapshot;
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private ticks = 0;

  /** @param speed simulation ticks per real tick. Use values above 1 to reach the end of a match quickly. */
  constructor(seed: number, private readonly speed = 1) {
    this.state = createMatch(seed);
    // A separate stream keeps the bot's choices from changing the battle's own random draws.
    this.bot = createRng((seed ^ 0x5bd1e995) >>> 0);
    this.snap = snapshotOf(this.state, this.myTeam);
    this.timer = setInterval(() => this.advance(), TICK_MS);
  }

  snapshot(): BattleSnapshot {
    return this.snap;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  play(instanceId: string, x: number, y: number): Promise<void> {
    const card = this.findCard(instanceId);
    if (!card) return Promise.reject(new Error('That card is not available to you'));
    const category = getCard(card.cardId).category;
    const action: PlayAction =
      category === 'structure'
        ? { kind: 'structure', instanceId, origin: cellOf({ x, y }) }
        : category === 'unit'
          ? { kind: 'unit', instanceId, pos: { x, y } }
          : { kind: 'ability', instanceId, pos: { x, y } };
    const result = tryPlayCard(this.state, this.myTeam, action);
    if (!result.ok) return Promise.reject(new Error(result.reason));
    this.publish();
    return Promise.resolve();
  }

  store(instanceId: string): Promise<void> {
    const result = tryStoreCard(this.state, this.myTeam, instanceId);
    if (!result.ok) return Promise.reject(new Error(result.reason));
    this.publish();
    return Promise.resolve();
  }

  dispose(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.listeners.clear();
  }

  private advance(): void {
    if (this.state.winner !== null) {
      this.dispose();
      return;
    }
    for (let i = 0; i < this.speed && this.state.winner === null; i++) {
      stepBattle(this.state, TICK_MS);
      this.ticks++;
      if (this.ticks % BOT_EVERY_TICKS === 0) this.botTurn();
    }
    this.publish();
  }

  private botTurn(): void {
    const hand = this.state.teams.blue.hand.hand;
    const card = hand[0];
    if (!card) return;
    const category = getCard(card.cardId).category;
    for (let attempt = 0; attempt < BOT_ATTEMPTS; attempt++) {
      if (tryPlayCard(this.state, 'blue', this.botAction(category, card.instanceId)).ok) return;
    }
  }

  /** A random spot in the area where this kind of card is usually legal. Most attempts fail validation and are retried. */
  private botAction(category: CardCategory, instanceId: string): PlayAction {
    const r = this.bot;
    if (category === 'structure') {
      return { kind: 'structure', instanceId, origin: { x: 40 + Math.floor(r.next() * 20), y: 6 + Math.floor(r.next() * 28) } };
    }
    if (category === 'unit') {
      const hq = HQ_ORIGIN.blue;
      return { kind: 'unit', instanceId, pos: { x: hq.x - 10 + r.next() * 12, y: hq.y - 6 + r.next() * 16 } };
    }
    return { kind: 'ability', instanceId, pos: { x: 10 + r.next() * 30, y: 8 + r.next() * 24 } };
  }

  private findCard(instanceId: string) {
    const hand = this.state.teams[this.myTeam].hand;
    if (hand.stored?.instanceId === instanceId) return hand.stored;
    return hand.hand.find((c) => c.instanceId === instanceId);
  }

  private publish(): void {
    this.snap = snapshotOf(this.state, this.myTeam);
    for (const listener of [...this.listeners]) listener();
  }
}
