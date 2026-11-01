// Targeting, firing, armor, splash, repair, EMP fields, and mines. Pure rules over the battle state.
import { getDefinition, getStructure } from '../data';
import { armorFacing, damageThroughArmor } from '../rules/combat';
import type { KillKind } from '../rules/economy';
import type { ArmorSet, Definition, TeamId, WeaponDef } from '../types';
import { attackDirection, distance, type Vec2 } from './geometry';
import type { BattleState, Entity } from './state';

const NO_ARMOR: ArmorSet = { front: 'none', side: 'none', rear: 'none' };

export function enemyOf(team: TeamId): TeamId {
  return team === 'red' ? 'blue' : 'red';
}

export function defOf(e: Entity): Definition {
  return getDefinition(e.defId);
}

export function weaponOf(e: Entity): WeaponDef | undefined {
  const def = defOf(e);
  return def.category === 'ability' ? undefined : def.weapon;
}

export function armorOf(e: Entity): ArmorSet {
  if (e.kind === 'mine') return NO_ARMOR;
  const def = defOf(e);
  return def.category === 'ability' ? NO_ARMOR : def.armor;
}

export function isHeadquarters(e: Entity): boolean {
  return e.defId === 'headquarters';
}

/** Kill reward category. Structures pay 5, light units 2, heavy units (200+ HP) 8. */
export function killKindOf(e: Entity): KillKind {
  const def = defOf(e);
  if (def.category === 'structure') return 'structure';
  if (def.category === 'unit') return def.hp >= 200 ? 'heavy' : 'light';
  return 'light';
}

export function canHit(weapon: WeaponDef, target: Entity): boolean {
  if (weapon.targets === 'none') return false;
  return weapon.targets === 'both' || weapon.targets === target.layer;
}

export function isTargetable(e: Entity, nowMs: number): boolean {
  return e.hp > 0 && (e.kind === 'structure' || e.kind === 'unit') && e.concealedUntilMs <= nowMs;
}

export function applyDamage(target: Entity, amount: number, byTeam: TeamId): void {
  if (amount <= 0 || target.hp <= 0) return;
  target.hp = Math.max(0, target.hp - amount);
  target.lastDamagedBy = byTeam;
}

/** Keeps the current target while it is still valid, otherwise picks the nearest valid enemy in range. */
export function acquireTarget(state: BattleState, self: Entity, weapon: WeaponDef, range: number): Entity | null {
  const now = state.elapsedMs;
  const current = self.targetId !== null ? state.entities.get(self.targetId) : undefined;
  if (
    current &&
    current.team !== self.team &&
    isTargetable(current, now) &&
    canHit(weapon, current) &&
    distance(self.pos, current.pos) <= range
  ) {
    return current;
  }
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const e of state.entities.values()) {
    if (e.team === self.team || !isTargetable(e, now) || !canHit(weapon, e)) continue;
    const d = distance(self.pos, e.pos);
    if (d <= range && d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/** A friendly point-defense unit in range that can shoot down this attack, if it is ready. */
function interceptor(state: BattleState, target: Entity, attacker: Entity, weapon: WeaponDef): Entity | null {
  const airborne = attacker.layer === 'air' || weapon.projectile === 'homing';
  if (!airborne) return null;
  for (const pd of state.entities.values()) {
    if (pd.team !== target.team || pd.kind !== 'unit' || pd.hp <= 0) continue;
    if (pd.disabledUntilMs > state.elapsedMs || pd.cooldownMs > 0) continue;
    const def = defOf(pd);
    if (def.category !== 'unit' || !def.pointDefense) continue;
    if (distance(pd.pos, target.pos) > def.pointDefense.range) continue;
    return pd;
  }
  return null;
}

function applySplash(state: BattleState, impact: Vec2, attacker: Entity, weapon: WeaponDef, skip: Entity): void {
  if (!weapon.splashRadius) return;
  const now = state.elapsedMs;
  for (const e of state.entities.values()) {
    if (e === skip || e.team === attacker.team || !isTargetable(e, now) || !canHit(weapon, e)) continue;
    if (distance(e.pos, impact) > weapon.splashRadius) continue;
    const dir = attackDirection(e.facing, impact, e.pos);
    const amount = damageThroughArmor(
      Math.round(weapon.damage * 0.5),
      weapon.penetration,
      armorFacing(armorOf(e), dir),
    );
    applyDamage(e, amount, attacker.team);
  }
}

/** Resolves one shot. Consumes the attacker's cooldown whether or not it hits. */
export function fire(state: BattleState, attacker: Entity, target: Entity, weapon: WeaponDef): void {
  attacker.cooldownMs = weapon.attackIntervalMs;

  const pd = interceptor(state, target, attacker, weapon);
  if (pd) {
    pd.cooldownMs = weaponOf(pd)?.attackIntervalMs ?? 600;
    return;
  }

  if (state.rng.next() >= weapon.accuracy) return;

  const dir = attackDirection(target.facing, attacker.pos, target.pos);
  const amount = damageThroughArmor(weapon.damage, weapon.penetration, armorFacing(armorOf(target), dir));
  applyDamage(target, amount, attacker.team);
  applySplash(state, target.pos, attacker, weapon, target);
}

/** Heals friendly units and structures in radius. Full HP entities and mines are skipped. */
export function repairPulse(state: BattleState, repairer: Entity): void {
  const def = defOf(repairer);
  if (def.category === 'ability' || !def.repair) return;
  const { radius, amount } = def.repair;
  for (const e of state.entities.values()) {
    if (e.team !== repairer.team || e.kind === 'mine' || e.hp <= 0 || e.hp >= e.maxHp) continue;
    if (distance(e.pos, repairer.pos) <= radius) e.hp = Math.min(e.maxHp, e.hp + amount);
  }
}

/** Live EMP fields keep enemy electronics offline while they stand. Low-tech entities are immune. */
export function emitterFields(state: BattleState): void {
  const now = state.elapsedMs;
  for (const emitter of state.entities.values()) {
    if (emitter.kind !== 'structure' || emitter.hp <= 0 || emitter.disabledUntilMs > now) continue;
    const def = defOf(emitter);
    if (def.category !== 'structure' || !def.emitterField) continue;
    const { radius, disableMs } = def.emitterField;
    for (const e of state.entities.values()) {
      if (e.team === emitter.team || (e.kind !== 'structure' && e.kind !== 'unit') || e.hp <= 0) continue;
      if (defOf(e).tags.includes('lowTech')) continue;
      if (distance(e.pos, emitter.pos) <= radius) {
        e.disabledUntilMs = Math.max(e.disabledUntilMs, now + disableMs);
      }
    }
  }
}

/** Mines detonate under the first enemy ground unit that steps within the trigger radius. */
export function triggerMines(state: BattleState): void {
  for (const mine of state.entities.values()) {
    if (mine.kind !== 'mine' || mine.hp <= 0) continue;
    const def = getStructure(mine.defId);
    if (!def.mines) continue;
    for (const u of state.entities.values()) {
      if (u.team === mine.team || u.kind !== 'unit' || u.hp <= 0 || u.layer !== 'ground') continue;
      if (distance(u.pos, mine.pos) > def.mines.triggerRadius) continue;
      const dir = attackDirection(u.facing, mine.pos, u.pos);
      const amount = damageThroughArmor(def.mines.damage, 'heavy', armorFacing(armorOf(u), dir));
      applyDamage(u, amount, mine.team);
      mine.hp = 0;
      break;
    }
  }
}
