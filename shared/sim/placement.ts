// Territory and placement validation. Pure functions over the battle state.
import { getStructure } from '../data';
import type { TeamId } from '../types';
import { footprintCells, footprintCenter, footprintInArena, positionInArena, type Cell } from './arena';
import { distance, type Vec2 } from './geometry';
import type { BattleState, Entity } from './state';

export interface Provider {
  center: Vec2;
  radius: number;
}

function centerOf(e: Entity): Vec2 {
  return footprintCenter(e.origin, e.footprint);
}

/** Living territory providers (Headquarters, Outposts) owned by a team. */
export function providersOf(state: BattleState, team: TeamId): Provider[] {
  const out: Provider[] = [];
  for (const e of state.entities.values()) {
    if (e.team !== team || e.kind !== 'structure' || e.hp <= 0) continue;
    const def = getStructure(e.defId);
    if (def.territoryRadius === undefined) continue;
    out.push({ center: centerOf(e), radius: def.territoryRadius });
  }
  return out;
}

export function inOwnTerritory(state: BattleState, team: TeamId, p: Vec2): boolean {
  return providersOf(state, team).some((prov) => distance(prov.center, p) <= prov.radius);
}

export function isCellOccupied(state: BattleState, cell: Cell): boolean {
  for (const e of state.entities.values()) {
    if (e.kind !== 'structure' || e.hp <= 0) continue;
    if (footprintCells(e.origin, e.footprint).some((c) => c.x === cell.x && c.y === cell.y)) return true;
  }
  return false;
}

/** Returns an error message, or null if the structure can be placed at this origin. */
export function structurePlacementError(
  state: BattleState,
  team: TeamId,
  defId: string,
  origin: Cell,
): string | null {
  const def = getStructure(defId);
  if (!footprintInArena(origin, def.footprint)) return 'That spot is outside the arena';
  const cells = footprintCells(origin, def.footprint);
  if (cells.some((c) => isCellOccupied(state, c))) return 'That spot is already occupied';
  const providers = providersOf(state, team);
  const inTerritory = cells.every((c) => {
    const center = { x: c.x + 0.5, y: c.y + 0.5 };
    return providers.some((p) => distance(p.center, center) <= p.radius);
  });
  if (!inTerritory) return 'Structures must be placed in your own territory';
  return null;
}

/** Returns an error message, or null if units can be deployed at this point. */
export function unitDeployError(state: BattleState, team: TeamId, pos: Vec2): string | null {
  if (!positionInArena(pos)) return 'That spot is outside the arena';
  if (!inOwnTerritory(state, team, pos)) return 'Units must deploy in your own territory';
  return null;
}

/** Ability targets can be anywhere on the battlefield. */
export function abilityTargetError(pos: Vec2): string | null {
  return positionInArena(pos) ? null : 'That spot is outside the arena';
}
