// Server-authoritative player actions. Each action validates first, then commits in one step.
import { getCard, getStructure, getUnit } from '../data';
import { trySpend } from '../rules/economy';
import { playCard as removeFromHand, storeCard as moveToStored, type HandState } from '../rules/hand';
import type { CardInstance, TeamId } from '../types';
import { ARENA, cellOf, type Cell } from './arena';
import { scheduleAbility } from './abilities';
import type { Vec2 } from './geometry';
import { abilityTargetError, structurePlacementError, unitDeployError } from './placement';
import { type BattleState, spawnEntity } from './state';

export type PlayAction =
  | { kind: 'structure'; instanceId: string; origin: Cell }
  | { kind: 'unit'; instanceId: string; pos: Vec2 }
  | { kind: 'ability'; instanceId: string; pos: Vec2 };

export type ActionResult =
  | { ok: true; discardedInstanceId?: string }
  | { ok: false; reason: string };

const fail = (reason: string): ActionResult => ({ ok: false, reason });

function findInstance(hand: HandState, instanceId: string): CardInstance | undefined {
  if (hand.stored?.instanceId === instanceId) return hand.stored;
  return hand.hand.find((c) => c.instanceId === instanceId);
}

function validate(state: BattleState, team: TeamId, action: PlayAction, cardId: string): string | null {
  switch (action.kind) {
    case 'structure':
      return structurePlacementError(state, team, cardId, action.origin);
    case 'unit':
      return unitDeployError(state, team, action.pos);
    case 'ability':
      return abilityTargetError(action.pos);
  }
}

function clampToArena(p: Vec2): Vec2 {
  return {
    x: Math.min(ARENA.width - 0.01, Math.max(0.01, p.x)),
    y: Math.min(ARENA.height - 0.01, Math.max(0.01, p.y)),
  };
}

function commit(state: BattleState, team: TeamId, action: PlayAction, cardId: string): void {
  switch (action.kind) {
    case 'structure': {
      const structure = spawnEntity(state, { team, defId: cardId, kind: 'structure', origin: action.origin });
      const def = getStructure(cardId);
      if (def.mines) {
        for (let i = 0; i < def.mines.count; i++) {
          const angle = state.rng.next() * 2 * Math.PI;
          const r = 1.5 + state.rng.next() * 1.5;
          const pos = clampToArena({
            x: structure.pos.x + Math.cos(angle) * r,
            y: structure.pos.y + Math.sin(angle) * r,
          });
          spawnEntity(state, { team, defId: cardId, kind: 'mine', origin: cellOf(pos), pos });
        }
      }
      break;
    }
    case 'unit': {
      const def = getUnit(cardId);
      for (let i = 0; i < def.spawnCount; i++) {
        // Multi-body units (e.g. drone swarms) fan out around the deploy point.
        const angle = (2 * Math.PI * i) / def.spawnCount;
        const offset = def.spawnCount > 1 ? 0.8 : 0;
        const pos = clampToArena({
          x: action.pos.x + Math.cos(angle) * offset,
          y: action.pos.y + Math.sin(angle) * offset,
        });
        spawnEntity(state, { team, defId: cardId, kind: 'unit', origin: cellOf(pos), pos });
      }
      break;
    }
    case 'ability':
      scheduleAbility(state, team, cardId, action.pos);
      break;
  }
}

/** Plays a card from the hand or the stored slot. Nothing changes unless every check passes. */
export function tryPlayCard(state: BattleState, team: TeamId, action: PlayAction): ActionResult {
  if (state.winner !== null) return fail('The match is over');

  const ts = state.teams[team];
  const instance = findInstance(ts.hand, action.instanceId);
  if (!instance) return fail('That card is not available to you');

  const card = getCard(instance.cardId);
  if (card.category !== action.kind) return fail('That card cannot be played this way');

  const error = validate(state, team, action, card.id);
  if (error) return fail(error);

  const spend = trySpend(ts.points, card.cost);
  if (!spend.ok) return fail('Not enough points');

  ts.points = spend.points;
  ts.hand = removeFromHand(ts.hand, instance.instanceId);
  commit(state, team, action, card.id);
  return { ok: true };
}

/** Moves a card from the hand into the stored slot. The previously stored card is discarded. */
export function tryStoreCard(state: BattleState, team: TeamId, instanceId: string): ActionResult {
  if (state.winner !== null) return fail('The match is over');

  const ts = state.teams[team];
  if (!ts.hand.hand.some((c) => c.instanceId === instanceId)) {
    return fail('Only cards in your hand can be stored');
  }
  const result = moveToStored(ts.hand, instanceId);
  ts.hand = result.state;
  return result.discarded ? { ok: true, discardedInstanceId: result.discarded.instanceId } : { ok: true };
}
