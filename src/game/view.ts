// Pure client logic: screen geometry, visibility, hand layout, placement hints, interpolation.
// No Phaser and no DOM here, so the tests run in Node. Placement hints mirror the sim's validators.
// The server decides every play. A hint only saves a round trip for a play it already knows is invalid.
import { getAbility, getCard, getDefinition, getStructure } from '../../shared/data';
import { matchPhase, PHASE_MS, passiveIncomePerWave, type MatchPhase } from '../../shared/rules/economy';
import {
  ARENA,
  cellOf,
  footprintCells,
  footprintCenter,
  footprintInArena,
  positionInArena,
  TICK_MS,
  type Cell,
} from '../../shared/sim';
import type { CardCategory, TeamId } from '../../shared/types';
import type { ViewCard, ViewEntity, ViewPending } from './source';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Maps arena meters to screen pixels. */
export interface Frame {
  left: number;
  top: number;
  /** Pixels per meter (one cell is one meter). */
  cell: number;
}

export const SCREEN = { width: 960, height: 540 } as const;

/** 64 x 40 meters at 9 px per meter is 576 x 360. It sits between the side panels, under the HUD bar. */
export const ARENA_FRAME: Frame = { left: 192, top: 44, cell: 9 };

export const HAND_TOP = 412;
export const CARD_SIZE = { w: 150, h: 112 } as const;

export const MATCH_MS = PHASE_MS.matchEnd;

export function toScreen(p: Point, f: Frame = ARENA_FRAME): Point {
  return { x: f.left + p.x * f.cell, y: f.top + p.y * f.cell };
}

export function toArena(sx: number, sy: number, f: Frame = ARENA_FRAME): Point {
  return { x: (sx - f.left) / f.cell, y: (sy - f.top) / f.cell };
}

export function arenaRect(f: Frame = ARENA_FRAME): Rect {
  return { x: f.left, y: f.top, w: ARENA.width * f.cell, h: ARENA.height * f.cell };
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

export interface HandRects {
  /** Three hand slots, left to right. */
  hand: Rect[];
  stored: Rect;
}

export function handRects(): HandRects {
  const hand = [0, 1, 2].map((i) => ({ x: 40 + i * 164, y: HAND_TOP, w: CARD_SIZE.w, h: CARD_SIZE.h }));
  return { hand, stored: { x: 600, y: HAND_TOP, w: CARD_SIZE.w, h: CARD_SIZE.h } };
}

export interface HandView {
  slots: (ViewCard | null)[];
  stored: ViewCard | null;
}

/** Places the viewer's cards into fixed slots. Cards that have left the hand do not reappear. */
export function handView(cards: readonly ViewCard[]): HandView {
  const slots: (ViewCard | null)[] = [null, null, null];
  let stored: ViewCard | null = null;
  for (const c of cards) {
    if (c.zone === 'stored') stored = c;
    else if (c.slot >= 0 && c.slot < slots.length) slots[c.slot] = c;
  }
  return { slots, stored };
}

export interface CardInfo {
  id: string;
  name: string;
  description: string;
  category: CardCategory;
  cost: number;
  rarity: string;
}

export function cardInfo(cardId: string): CardInfo {
  const card = getCard(cardId);
  const def = getDefinition(cardId);
  return {
    id: cardId,
    name: def.name,
    description: def.description,
    category: card.category,
    cost: card.cost,
    rarity: card.rarity,
  };
}

/** Enemy mines are hidden. Enemy units and structures are hidden while concealed. Own pieces are always shown. */
export function isVisibleTo(e: ViewEntity, viewer: TeamId, elapsedMs: number): boolean {
  if (e.team === viewer) return true;
  if (e.kind === 'mine') return false;
  return e.concealedUntilMs <= elapsedMs;
}

export function timeLeftMs(elapsedMs: number): number {
  return Math.max(0, MATCH_MS - elapsedMs);
}

/** m:ss. Rounds down, so the clock reads 0:00 only at the end. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function phaseLabel(phase: MatchPhase): string {
  switch (phase) {
    case 'build':
      return 'BUILD';
    case 'ramp':
      return 'RAMP';
    case 'overtime':
      return 'OVERTIME';
    case 'ended':
      return 'ENDED';
  }
}

export function incomeLabel(elapsedMs: number): string {
  const amount = passiveIncomePerWave(elapsedMs);
  return matchPhase(elapsedMs) === 'overtime' ? `+${amount} per wave (x1.5)` : `+${amount} per wave`;
}

export type Outcome = 'victory' | 'defeat' | 'draw';

export function outcomeFor(winner: TeamId | 'draw' | null, viewer: TeamId): Outcome | null {
  if (winner === null) return null;
  if (winner === 'draw') return 'draw';
  return winner === viewer ? 'victory' : 'defeat';
}

export function endReasonLabel(reason: 'hq_destroyed' | 'time_limit' | null): string {
  if (reason === 'hq_destroyed') return 'A Headquarters was destroyed. The match is over.';
  if (reason === 'time_limit') return 'Time is up. The side with more Headquarters HP left wins.';
  return '';
}

export function hpFraction(hp: number, maxHp: number): number {
  if (maxHp <= 0) return 0;
  return Math.min(1, Math.max(0, hp / maxHp));
}

export function headquartersOf(entities: readonly ViewEntity[], team: TeamId): ViewEntity | undefined {
  return entities.find((e) => e.team === team && e.defId === 'headquarters');
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** How far between the last two ticks the screen is, from 0 to 1. Clamped so a late tick never overshoots. */
export function tickAlpha(nowMs: number, arrivedAtMs: number, tickMs: number = TICK_MS): number {
  return Math.min(1, Math.max(0, (nowMs - arrivedAtMs) / tickMs));
}

/** Pending abilities count up from 0 to 1 over their delay. Instant ones are already done. */
export function pendingProgress(p: ViewPending, elapsedMs: number): number {
  const delay = getAbility(p.defId).delayMs;
  if (delay <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - (p.resolveAtMs - elapsedMs) / delay));
}

export interface Provider {
  center: Point;
  radius: number;
}

/** Living territory providers (Headquarters and Outposts) for one team. Matches sim placement.providersOf. */
export function providersOf(entities: readonly ViewEntity[], team: TeamId): Provider[] {
  const out: Provider[] = [];
  for (const e of entities) {
    if (e.team !== team || e.kind !== 'structure' || e.hp <= 0) continue;
    const def = getStructure(e.defId);
    if (def.territoryRadius === undefined) continue;
    out.push({ center: footprintCenter({ x: e.originX, y: e.originY }, def.footprint), radius: def.territoryRadius });
  }
  return out;
}

function inTerritory(providers: readonly Provider[], p: Point): boolean {
  return providers.some((prov) => Math.hypot(prov.center.x - p.x, prov.center.y - p.y) <= prov.radius);
}

function occupiedCells(entities: readonly ViewEntity[]): Set<string> {
  const taken = new Set<string>();
  for (const e of entities) {
    if (e.kind !== 'structure' || e.hp <= 0) continue;
    for (const c of footprintCells({ x: e.originX, y: e.originY }, getStructure(e.defId).footprint)) {
      taken.add(`${c.x},${c.y}`);
    }
  }
  return taken;
}

export interface PlacementHint {
  ok: boolean;
  /** The same message the sim gives for this placement, or null when it is valid. */
  reason: string | null;
  /** Structures only: the cell the footprint would start at. */
  origin: Cell | null;
}

/**
 * Client-side preview of a play. Mirrors the sim's validators. Parity is tested against them directly.
 * `at` is the raw pointer position in meters. Units snap to a cell centre in the sim, so the hint does too.
 */
export function placementHint(
  category: CardCategory,
  defId: string,
  at: Point,
  entities: readonly ViewEntity[],
  viewer: TeamId,
): PlacementHint {
  if (category === 'structure') {
    const origin = cellOf(at);
    const footprint = getStructure(defId).footprint;
    const cells = footprintCells(origin, footprint);
    const taken = occupiedCells(entities);
    let reason: string | null = null;
    if (!footprintInArena(origin, footprint)) {
      reason = 'That spot is outside the arena';
    } else if (cells.some((c) => taken.has(`${c.x},${c.y}`))) {
      reason = 'That spot is already occupied';
    } else {
      const providers = providersOf(entities, viewer);
      if (!cells.every((c) => inTerritory(providers, { x: c.x + 0.5, y: c.y + 0.5 }))) {
        reason = 'Structures must be placed in your own territory';
      }
    }
    return { ok: reason === null, reason, origin };
  }
  if (category === 'unit') {
    let reason: string | null = null;
    if (!positionInArena(at)) reason = 'That spot is outside the arena';
    else if (!inTerritory(providersOf(entities, viewer), at)) reason = 'Units must deploy in your own territory';
    return { ok: reason === null, reason, origin: null };
  }
  const reason = positionInArena(at) ? null : 'That spot is outside the arena';
  return { ok: reason === null, reason, origin: null };
}

export function affordable(cost: number, points: number): boolean {
  return cost <= points;
}

export interface SideCounts {
  myUnits: number;
  myStructures: number;
  enemyUnits: number;
  enemyStructures: number;
}

/** Counts for the side panels. Enemy numbers include only what the viewer can see. */
export function countsFor(entities: readonly ViewEntity[], viewer: TeamId, elapsedMs: number): SideCounts {
  const counts: SideCounts = { myUnits: 0, myStructures: 0, enemyUnits: 0, enemyStructures: 0 };
  for (const e of entities) {
    if (e.hp <= 0 || !isVisibleTo(e, viewer, elapsedMs)) continue;
    const mine = e.team === viewer;
    if (e.kind === 'unit') {
      if (mine) counts.myUnits++;
      else counts.enemyUnits++;
    } else if (e.kind === 'structure') {
      if (mine) counts.myStructures++;
      else counts.enemyStructures++;
    }
  }
  return counts;
}
