// Drawing helpers for the battle screen. Placeholder shapes for now: silhouettes and team colours
// carry the readability rules. Pixel art replaces these in a later stage.
import type Phaser from 'phaser';
import { getAbility, getStructure, getUnit } from '../../shared/data';
import { ARENA, cellCentre } from '../../shared/sim';
import type { CardCategory, TeamId } from '../../shared/types';
import type { ViewEntity, ViewPending } from '../game/source';
import {
  arenaRect,
  hpFraction,
  toScreen,
  type Frame,
  type PlacementHint,
  type Point,
  type Provider,
  type Rect,
} from '../game/view';

export const PALETTE = {
  bg: 0x1b1714,
  panel: 0x2a221d,
  field: 0x2b241f,
  grid: 0x6b5e4f,
  border: 0x8a7f6e,
  cream: 0xe8d9b5,
  muted: 0x8a7f6e,
  red: 0xc2453a,
  redDark: 0x6e2a24,
  blue: 0x3a7bc2,
  blueDark: 0x22466f,
  warn: 0xf2d15b,
  ok: 0x6fbf73,
  bad: 0xd9534f,
  structure: 0xc9a227,
  unit: 0x4fb3a9,
  ability: 0x9b6fd6,
  white: 0xffffff,
} as const;

const TEAM_COLOR: Record<TeamId, number> = { red: PALETTE.red, blue: PALETTE.blue };
const TEAM_DARK: Record<TeamId, number> = { red: PALETTE.redDark, blue: PALETTE.blueDark };
const CATEGORY_COLOR: Record<CardCategory, number> = {
  structure: PALETTE.structure,
  unit: PALETTE.unit,
  ability: PALETTE.ability,
};

export function teamColor(team: TeamId): number {
  return TEAM_COLOR[team];
}

export function categoryColor(category: CardCategory): number {
  return CATEGORY_COLOR[category];
}

/** Draws the static field once: ground, one-meter grid, border, and the midline. */
export function drawField(g: Phaser.GameObjects.Graphics, f: Frame): void {
  const r = arenaRect(f);
  g.fillStyle(PALETTE.field, 1);
  g.fillRect(r.x, r.y, r.w, r.h);
  g.lineStyle(1, PALETTE.grid, 0.22);
  for (let x = 0; x <= ARENA.width; x++) {
    const px = f.left + x * f.cell;
    g.lineBetween(px, r.y, px, r.y + r.h);
  }
  for (let y = 0; y <= ARENA.height; y++) {
    const py = f.top + y * f.cell;
    g.lineBetween(r.x, py, r.x + r.w, py);
  }
  const mid = f.left + (ARENA.width / 2) * f.cell;
  g.lineStyle(1, PALETTE.muted, 0.35);
  g.lineBetween(mid, r.y, mid, r.y + r.h);
  g.lineStyle(2, PALETTE.border, 1);
  g.strokeRect(r.x, r.y, r.w, r.h);
}

export function drawTerritory(g: Phaser.GameObjects.Graphics, f: Frame, providers: Provider[], team: TeamId): void {
  for (const p of providers) {
    const c = toScreen(p.center, f);
    const radius = p.radius * f.cell;
    g.fillStyle(TEAM_COLOR[team], 0.08);
    g.fillCircle(c.x, c.y, radius);
    g.lineStyle(1, TEAM_COLOR[team], 0.35);
    g.strokeCircle(c.x, c.y, radius);
  }
}

export function drawStructure(g: Phaser.GameObjects.Graphics, f: Frame, e: ViewEntity, alpha: number): void {
  const def = getStructure(e.defId);
  const x = f.left + e.originX * f.cell + 1;
  const y = f.top + e.originY * f.cell + 1;
  const w = def.footprint.w * f.cell - 2;
  const h = def.footprint.h * f.cell - 2;
  g.fillStyle(TEAM_DARK[e.team], alpha);
  g.fillRect(x, y, w, h);
  g.lineStyle(1, TEAM_COLOR[e.team], alpha);
  g.strokeRect(x, y, w, h);

  const cx = x + w / 2;
  const cy = y + h / 2;
  if (e.defId === 'headquarters') {
    g.fillStyle(TEAM_COLOR[e.team], alpha);
    g.fillRect(cx - w * 0.25, cy - h * 0.25, w * 0.5, h * 0.5);
  } else if (def.weapon) {
    const len = f.cell * 0.9;
    g.lineStyle(2, PALETTE.cream, alpha);
    g.lineBetween(cx, cy, cx + Math.cos(e.facing) * len, cy + Math.sin(e.facing) * len);
  } else {
    g.fillStyle(PALETTE.cream, alpha * 0.6);
    g.fillCircle(cx, cy, 2);
  }
  drawHpBar(g, x, y - 5, w, e, alpha);
}

export function drawUnit(g: Phaser.GameObjects.Graphics, f: Frame, e: ViewEntity, pos: Point, alpha: number): void {
  const air = getUnit(e.defId).layer === 'air';
  const c = toScreen(pos, f);
  const r = f.cell * 0.7;
  g.fillStyle(TEAM_DARK[e.team], alpha);
  g.fillCircle(c.x, c.y, r + 1);
  g.fillStyle(TEAM_COLOR[e.team], alpha);
  g.fillCircle(c.x, c.y, r);
  if (air) {
    g.lineStyle(1, PALETTE.white, alpha);
    g.strokeCircle(c.x, c.y, r + 3);
  }
  g.lineStyle(2, PALETTE.cream, alpha);
  g.lineBetween(c.x, c.y, c.x + Math.cos(e.facing) * (r + 3), c.y + Math.sin(e.facing) * (r + 3));
  if (e.disabledUntilMs > 0) {
    g.lineStyle(1, PALETTE.warn, alpha);
    g.strokeCircle(c.x, c.y, r + 5);
  }
  drawHpBar(g, c.x - r, c.y - r - 5, r * 2, e, alpha);
}

export function drawMine(g: Phaser.GameObjects.Graphics, f: Frame, pos: Point, alpha: number): void {
  const c = toScreen(pos, f);
  g.fillStyle(PALETTE.warn, alpha * 0.8);
  g.fillCircle(c.x, c.y, 2);
}

/** A small bar above an entity. Only drawn while the entity is damaged. */
function drawHpBar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, e: ViewEntity, alpha: number): void {
  if (e.hp <= 0 || e.hp >= e.maxHp) return;
  const fraction = hpFraction(e.hp, e.maxHp);
  const color = fraction > 0.5 ? PALETTE.ok : fraction > 0.25 ? PALETTE.warn : PALETTE.bad;
  g.fillStyle(0x000000, alpha * 0.6);
  g.fillRect(x, y, w, 3);
  g.fillStyle(color, alpha);
  g.fillRect(x, y, w * fraction, 3);
}

export function drawPending(g: Phaser.GameObjects.Graphics, f: Frame, p: ViewPending, progress: number): void {
  const radius = getAbility(p.defId).radius * f.cell;
  const c = toScreen({ x: p.x, y: p.y }, f);
  const color = TEAM_COLOR[p.team];
  g.fillStyle(color, 0.08 + 0.18 * progress);
  g.fillCircle(c.x, c.y, radius);
  g.lineStyle(2, color, 0.5 + 0.5 * progress);
  g.strokeCircle(c.x, c.y, radius);
}

/** Preview of a play under the pointer. Green when the server would accept it, red otherwise. */
export function drawGhost(
  g: Phaser.GameObjects.Graphics,
  f: Frame,
  defId: string,
  category: CardCategory,
  at: Point,
  hint: PlacementHint,
): void {
  const color = hint.ok ? PALETTE.ok : PALETTE.bad;
  if (category === 'structure') {
    if (!hint.origin) return;
    const def = getStructure(defId);
    const origin = toScreen(hint.origin, f);
    const w = def.footprint.w * f.cell;
    const h = def.footprint.h * f.cell;
    g.fillStyle(color, 0.35);
    g.fillRect(origin.x, origin.y, w, h);
    g.lineStyle(2, color, 0.9);
    g.strokeRect(origin.x, origin.y, w, h);
    return;
  }
  if (category === 'unit') {
    const c = toScreen(cellCentre(at), f);
    g.lineStyle(2, color, 0.9);
    g.strokeCircle(c.x, c.y, f.cell * 0.7);
    return;
  }
  const c = toScreen(at, f);
  const radius = getAbility(defId).radius * f.cell;
  g.fillStyle(color, 0.12);
  g.fillCircle(c.x, c.y, radius);
  g.lineStyle(2, color, 0.8);
  g.strokeCircle(c.x, c.y, radius);
}

export function drawCard(
  g: Phaser.GameObjects.Graphics,
  r: Rect,
  category: CardCategory,
  state: { selected: boolean; affordable: boolean; sending: boolean },
): void {
  const alpha = state.affordable ? 1 : 0.5;
  g.fillStyle(PALETTE.panel, alpha);
  g.fillRoundedRect(r.x, r.y, r.w, r.h, 8);
  g.lineStyle(state.selected ? 3 : 2, state.selected ? PALETTE.white : CATEGORY_COLOR[category], alpha);
  g.strokeRoundedRect(r.x, r.y, r.w, r.h, 8);
  g.fillStyle(CATEGORY_COLOR[category], alpha);
  g.fillRect(r.x + 10, r.y + r.h - 24, 3, 14);
  if (state.sending) {
    g.fillStyle(0x000000, 0.45);
    g.fillRoundedRect(r.x, r.y, r.w, r.h, 8);
  }
}

export function drawEmptySlot(g: Phaser.GameObjects.Graphics, r: Rect): void {
  g.lineStyle(1, PALETTE.muted, 0.35);
  g.strokeRoundedRect(r.x, r.y, r.w, r.h, 8);
}

export function drawBar(
  g: Phaser.GameObjects.Graphics,
  r: Rect,
  fraction: number,
  color: number,
): void {
  g.fillStyle(0x000000, 0.55);
  g.fillRect(r.x, r.y, r.w, r.h);
  g.fillStyle(color, 1);
  g.fillRect(r.x, r.y, r.w * fraction, r.h);
  g.lineStyle(1, PALETTE.border, 1);
  g.strokeRect(r.x, r.y, r.w, r.h);
}
