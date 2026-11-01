// Battlefield layout. Structures snap to a 1 m grid. Units move freely in continuous space.
import type { TeamId } from '../types';
import type { Vec2 } from './geometry';

export interface Cell {
  x: number;
  y: number;
}

export interface Footprint {
  w: number;
  h: number;
}

/** Arena size in meters (one cell per meter). */
export const ARENA = { width: 64, height: 40 } as const;

export const TICK_MS = 100;
export const STARTING_POINTS = 20;

export const HQ_FOOTPRINT: Footprint = { w: 3, h: 3 };
/** Red starts on the left, blue on the right, both vertically centered. */
export const HQ_ORIGIN: Record<TeamId, Cell> = {
  red: { x: 4, y: 18 },
  blue: { x: 57, y: 18 },
};

export function footprintCenter(origin: Cell, fp: Footprint): Vec2 {
  return { x: origin.x + fp.w / 2, y: origin.y + fp.h / 2 };
}

export function footprintCells(origin: Cell, fp: Footprint): Cell[] {
  const cells: Cell[] = [];
  for (let dy = 0; dy < fp.h; dy++) {
    for (let dx = 0; dx < fp.w; dx++) cells.push({ x: origin.x + dx, y: origin.y + dy });
  }
  return cells;
}

export function cellInArena(c: Cell): boolean {
  return c.x >= 0 && c.y >= 0 && c.x < ARENA.width && c.y < ARENA.height;
}

export function footprintInArena(origin: Cell, fp: Footprint): boolean {
  return footprintCells(origin, fp).every(cellInArena);
}

export function positionInArena(p: Vec2): boolean {
  return p.x >= 0 && p.y >= 0 && p.x <= ARENA.width && p.y <= ARENA.height;
}

export function cellOf(p: Vec2): Cell {
  return { x: Math.floor(p.x), y: Math.floor(p.y) };
}

/** Centre of the cell containing p. Units snap here so sub-cell click position never matters. */
export function cellCentre(p: Vec2): Vec2 {
  return { x: Math.floor(p.x) + 0.5, y: Math.floor(p.y) + 0.5 };
}

export function cellIndex(c: Cell): number {
  return c.y * ARENA.width + c.x;
}
