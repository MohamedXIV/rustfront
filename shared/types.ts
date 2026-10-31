// Core domain types shared by the browser client, the SpacetimeDB module and tests.
// Pure data only: no Phaser or SpacetimeDB imports here.

export type TeamId = 'red' | 'blue';

export type ArmorLevel = 'none' | 'light' | 'medium' | 'heavy';
export type PenetrationLevel = 'none' | 'light' | 'medium' | 'heavy';

/** Physical battlefield layer. Air units are only hit by weapons that target air. */
export type CombatLayer = 'ground' | 'air';

/** Which layers a weapon can hit. 'none' means support-only (no attack). */
export type TargetLayer = 'ground' | 'air' | 'both' | 'none';

export type ProjectileType = 'direct' | 'physical' | 'arc' | 'homing';

export type CardCategory = 'structure' | 'unit' | 'ability';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'power';

/** Armor per attack direction. Front/side/rear are relative to the unit's facing. */
export interface ArmorSet {
  front: ArmorLevel;
  side: ArmorLevel;
  rear: ArmorLevel;
}

export interface WeaponDef {
  /** Damage per shot before armor. */
  damage: number;
  /** Milliseconds between shots. */
  attackIntervalMs: number;
  /** Maximum range in meters. */
  range: number;
  /** Hit chance, 0..1. Artillery is intentionally low. */
  accuracy: number;
  penetration: PenetrationLevel;
  projectile: ProjectileType;
  targets: TargetLayer;
  /** Splash radius in meters for arc or AoE weapons. */
  splashRadius?: number;
}

export interface RepairDef {
  /** Radius in meters around the repairer. */
  radius: number;
  /** HP restored per tick to each friendly entity in radius. */
  amount: number;
  /** Milliseconds between ticks. */
  intervalMs: number;
}

export interface DefinitionBase {
  id: string;
  name: string;
  description: string;
  category: CardCategory;
  /** Gameplay tags such as 'lowTech' (EMP immune), 'spotter', 'pointDefense'. */
  tags: readonly string[];
}

export interface StructureDef extends DefinitionBase {
  category: 'structure';
  hp: number;
  armor: ArmorSet;
  /** Grid footprint in cells. */
  footprint: { w: number; h: number };
  weapon?: WeaponDef;
  repair?: RepairDef;
  /** Projects deployment territory around this structure, in meters. */
  territoryRadius?: number;
  /** Extra detection range in meters, used by Radar Tower. */
  radar?: { range: number; artilleryAccuracyBonus: number };
  /** Passive field that disables enemy electronics in radius. */
  emitterField?: { radius: number; disableMs: number };
  /** Hidden mines dropped on enemy ground units. */
  mines?: { count: number; damage: number; triggerRadius: number };
  /** Layer the structure occupies. All current structures are ground. */
  layer: CombatLayer;
}

export interface UnitDef extends DefinitionBase {
  category: 'unit';
  hp: number;
  armor: ArmorSet;
  /** Movement speed in meters per second. */
  speed: number;
  detectionRange: number;
  /** Number of independent bodies spawned by one card (e.g. drones). */
  spawnCount: number;
  layer: CombatLayer;
  weapon?: WeaponDef;
  repair?: RepairDef;
  /** Shoots down incoming homing and air attacks in range. */
  pointDefense?: { range: number };
}

export type AbilityEffect =
  | { kind: 'damage'; center: number; edge: number; armorVsHeavyMultiplier: number; scatter: number }
  | { kind: 'disable'; durationMs: number; affectsFriendly: boolean; immuneTags: readonly string[] }
  | { kind: 'conceal'; durationMs: number }
  | { kind: 'heal'; amount: number };

export interface AbilityDef extends DefinitionBase {
  category: 'ability';
  /** 'point' needs a target on the battlefield. 'instant' fires without targeting. */
  targeting: 'point' | 'instant';
  /** Delay before effects resolve, in milliseconds. */
  delayMs: number;
  radius: number;
  effects: readonly AbilityEffect[];
  /** Damage multiplier against Headquarters. 1 = full damage. */
  hqDamageMultiplier: number;
}

export type Definition = StructureDef | UnitDef | AbilityDef;

/**
 * One playable card. Its id matches the id of the Structure, Unit, or Ability
 * definition it deploys. Gameplay behavior comes from that definition.
 */
export interface CardDef {
  id: string;
  category: CardCategory;
  rarity: Rarity;
  cost: number;
  /** Relative spawn weight in the card pool. */
  weight: number;
}

export interface CardInstance {
  /** Unique id for this specific card in a hand. Clients use it to reference cards. */
  instanceId: string;
  cardId: string;
}
