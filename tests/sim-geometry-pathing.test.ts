import { describe, expect, it } from 'vitest';
import { ARENA, cellIndex, footprintCells, type Cell } from '../shared/sim/arena';
import { attackDirection, moveToward, normalizeAngle } from '../shared/sim/geometry';
import { findPath } from '../shared/sim/pathfinding';

const emptyGrid = () => new Uint8Array(ARENA.width * ARENA.height);

function block(grid: Uint8Array, cells: Cell[]): void {
  for (const c of cells) grid[cellIndex(c)] = 1;
}

describe('geometry', () => {
  it('wraps angles into (-PI, PI]', () => {
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 6);
    expect(normalizeAngle(-3 * Math.PI / 2)).toBeCloseTo(Math.PI / 2, 6);
    expect(normalizeAngle(0)).toBeCloseTo(0, 6);
  });

  it('classifies attacks as front, side, or rear relative to facing', () => {
    const target = { x: 10, y: 10 };
    const facingRight = 0;
    expect(attackDirection(facingRight, { x: 5, y: 10 }, target)).toBe('rear');
    expect(attackDirection(facingRight, { x: 15, y: 10 }, target)).toBe('front');
    expect(attackDirection(facingRight, { x: 10, y: 5 }, target)).toBe('side');
    expect(attackDirection(facingRight, { x: 10, y: 15 }, target)).toBe('side');
  });

  it('moves toward a goal without overshooting', () => {
    const p = moveToward({ x: 0, y: 0 }, { x: 3, y: 4 }, 1);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(1, 6);
    expect(moveToward({ x: 0, y: 0 }, { x: 1, y: 0 }, 5)).toEqual({ x: 1, y: 0 });
  });
});

describe('A* pathfinding', () => {
  it('finds a path across open ground', () => {
    const path = findPath(emptyGrid(), { x: 0, y: 0 }, { x: 5, y: 0 });
    expect(path).not.toBeNull();
    expect(path![path!.length - 1]).toEqual({ x: 5, y: 0 });
  });

  it('returns an empty path when already at the goal', () => {
    expect(findPath(emptyGrid(), { x: 3, y: 3 }, { x: 3, y: 3 })).toEqual([]);
  });

  it('routes around a wall', () => {
    const grid = emptyGrid();
    block(grid, Array.from({ length: 10 }, (_, i) => ({ x: 5, y: i })));
    const path = findPath(grid, { x: 0, y: 2 }, { x: 10, y: 2 });
    expect(path).not.toBeNull();
    expect(path!.some((c) => grid[cellIndex(c)] === 1)).toBe(false);
  });

  it('reports unreachable goals as null', () => {
    const grid = emptyGrid();
    block(grid, Array.from({ length: ARENA.height }, (_, y) => ({ x: 5, y })));
    expect(findPath(grid, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeNull();
  });

  it('allows the goal cell to be blocked (attacking a structure from outside its edge)', () => {
    const grid = emptyGrid();
    block(grid, footprintCells({ x: 10, y: 10 }, { w: 3, h: 3 }));
    const path = findPath(grid, { x: 0, y: 11 }, { x: 10, y: 11 });
    expect(path).not.toBeNull();
    expect(path![path!.length - 1]).toEqual({ x: 10, y: 11 });
  });

  it('reports a fully walled-in goal as unreachable', () => {
    const grid = emptyGrid();
    block(grid, footprintCells({ x: 10, y: 10 }, { w: 3, h: 3 }));
    expect(findPath(grid, { x: 0, y: 11 }, { x: 11, y: 11 })).toBeNull();
  });

  it('does not cut a blocked corner diagonally', () => {
    const grid = emptyGrid();
    // (1,0) is blocked, so the diagonal step (0,0) -> (1,1) is not allowed.
    block(grid, [{ x: 1, y: 0 }]);
    const path = findPath(grid, { x: 0, y: 0 }, { x: 1, y: 1 });
    expect(path).toEqual([{ x: 0, y: 1 }, { x: 1, y: 1 }]);
  });
});
