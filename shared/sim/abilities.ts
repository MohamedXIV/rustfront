// Ability scheduling and resolution. Effects resolve after their delay.
import { getAbility } from '../data';
import type { TeamId } from '../types';
import { applyDamage, armorOf, defOf, isHeadquarters } from './combat';
import { distance, type Vec2 } from './geometry';
import type { BattleState, PendingAbility } from './state';

export function scheduleAbility(state: BattleState, team: TeamId, defId: string, target: Vec2): void {
  const def = getAbility(defId);
  state.pending.push({
    id: state.nextId++,
    team,
    defId,
    target: { x: target.x, y: target.y },
    resolveAtMs: state.elapsedMs + def.delayMs,
  });
}

/** Offsets an aim point by a random amount up to `radius`, using the match RNG. */
function scatterAim(state: BattleState, center: Vec2, radius: number): Vec2 {
  const angle = state.rng.next() * 2 * Math.PI;
  const r = state.rng.next() * radius;
  return { x: center.x + Math.cos(angle) * r, y: center.y + Math.sin(angle) * r };
}

function resolveAbility(state: BattleState, p: PendingAbility): void {
  const def = getAbility(p.defId);
  const now = state.elapsedMs;

  for (const effect of def.effects) {
    if (effect.kind === 'damage') {
      const aim = effect.scatter > 0 ? scatterAim(state, p.target, effect.scatter) : p.target;
      for (const e of state.entities.values()) {
        if (e.team === p.team || (e.kind !== 'structure' && e.kind !== 'unit') || e.hp <= 0) continue;
        const d = distance(e.pos, aim);
        if (d > def.radius) continue;
        // Linear falloff: full center damage at the aim point, edge damage at the radius.
        let dmg = effect.center + (effect.edge - effect.center) * (d / def.radius);
        if (armorOf(e).front === 'heavy') dmg *= effect.armorVsHeavyMultiplier;
        if (isHeadquarters(e)) dmg *= def.hqDamageMultiplier;
        applyDamage(e, Math.round(dmg), p.team);
      }
    } else if (effect.kind === 'disable') {
      for (const e of state.entities.values()) {
        if (e.hp <= 0 || (e.kind !== 'structure' && e.kind !== 'unit')) continue;
        if (e.team === p.team && !effect.affectsFriendly) continue;
        if (defOf(e).tags.some((tag) => effect.immuneTags.includes(tag))) continue;
        if (distance(e.pos, p.target) > def.radius) continue;
        e.disabledUntilMs = Math.max(e.disabledUntilMs, now + effect.durationMs);
      }
    } else if (effect.kind === 'conceal') {
      for (const e of state.entities.values()) {
        if (e.team !== p.team || e.kind !== 'unit' || e.hp <= 0) continue;
        if (distance(e.pos, p.target) > def.radius) continue;
        e.concealedUntilMs = Math.max(e.concealedUntilMs, now + effect.durationMs);
      }
    } else if (effect.kind === 'heal') {
      for (const e of state.entities.values()) {
        if (e.team !== p.team || (e.kind !== 'structure' && e.kind !== 'unit') || e.hp <= 0) continue;
        if (distance(e.pos, p.target) > def.radius) continue;
        e.hp = Math.min(e.maxHp, e.hp + effect.amount);
      }
    }
  }
}

/** Resolves every pending ability whose delay has elapsed. */
export function resolveDueAbilities(state: BattleState): void {
  const due = state.pending.filter((p) => p.resolveAtMs <= state.elapsedMs);
  if (due.length === 0) return;
  state.pending = state.pending.filter((p) => p.resolveAtMs > state.elapsedMs);
  for (const p of due) resolveAbility(state, p);
}
