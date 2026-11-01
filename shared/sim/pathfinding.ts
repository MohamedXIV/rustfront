// A* on the 1 m grid. Structures block cells. Units use this for ground movement; drones fly straight.
import { ARENA, cellIndex, cellInArena, footprintCells, type Cell } from './arena';
import type { BattleState } from './state';

const SQRT2 = Math.SQRT2;
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/** One byte per cell: 1 means a living structure occupies the cell. */
export function buildBlocked(state: BattleState): Uint8Array {
  const blocked = new Uint8Array(ARENA.width * ARENA.height);
  for (const e of state.entities.values()) {
    if (e.kind !== 'structure' || e.hp <= 0) continue;
    for (const c of footprintCells(e.origin, e.footprint)) {
      if (cellInArena(c)) blocked[cellIndex(c)] = 1;
    }
  }
  return blocked;
}

function octile(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
}

/** Minimal binary heap of [priority, value]. */
class MinHeap {
  private prio: number[] = [];
  private val: number[] = [];

  get size(): number {
    return this.val.length;
  }

  push(value: number, priority: number): void {
    this.val.push(value);
    this.prio.push(priority);
    let i = this.val.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent] <= this.prio[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number | undefined {
    if (this.val.length === 0) return undefined;
    const top = this.val[0];
    const lastVal = this.val.pop()!;
    const lastPrio = this.prio.pop()!;
    if (this.val.length > 0) {
      this.val[0] = lastVal;
      this.prio[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.val.length && this.prio[l] < this.prio[m]) m = l;
        if (r < this.val.length && this.prio[r] < this.prio[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(i: number, j: number): void {
    [this.val[i], this.val[j]] = [this.val[j], this.val[i]];
    [this.prio[i], this.prio[j]] = [this.prio[j], this.prio[i]];
  }
}

/**
 * Finds a path from start to goal cell. The goal may be blocked (e.g. attacking a structure).
 * Diagonal steps may not cut blocked corners. Returns cells after the start, or null if unreachable.
 */
export function findPath(blocked: Uint8Array, start: Cell, goal: Cell, maxNodes = 4000): Cell[] | null {
  if (!cellInArena(start) || !cellInArena(goal)) return null;
  const W = ARENA.width;
  const N = W * ARENA.height;
  const startIdx = cellIndex(start);
  const goalIdx = cellIndex(goal);
  if (startIdx === goalIdx) return [];

  const g = new Float64Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const open = new MinHeap();

  g[startIdx] = 0;
  open.push(startIdx, octile(start.x, start.y, goal.x, goal.y));

  let expanded = 0;
  while (open.size > 0) {
    const cur = open.pop()!;
    if (closed[cur]) continue;
    if (cur === goalIdx) {
      const path: Cell[] = [];
      let idx = cur;
      while (idx !== startIdx) {
        path.push({ x: idx % W, y: Math.floor(idx / W) });
        idx = came[idx];
      }
      return path.reverse();
    }
    closed[cur] = 1;
    if (++expanded > maxNodes) return null;

    const cx = cur % W;
    const cy = Math.floor(cur / W);
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!cellInArena({ x: nx, y: ny })) continue;
      const ni = ny * W + nx;
      if (closed[ni]) continue;
      if (blocked[ni] && ni !== goalIdx) continue;
      if (dx !== 0 && dy !== 0) {
        const sideA = cy * W + nx;
        const sideB = ny * W + cx;
        if ((blocked[sideA] && sideA !== goalIdx) || (blocked[sideB] && sideB !== goalIdx)) continue;
      }
      const step = dx !== 0 && dy !== 0 ? SQRT2 : 1;
      const tentative = g[cur] + step;
      if (tentative < g[ni]) {
        g[ni] = tentative;
        came[ni] = cur;
        open.push(ni, tentative + octile(nx, ny, goal.x, goal.y));
      }
    }
  }
  return null;
}
