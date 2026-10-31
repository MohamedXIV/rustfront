// Card economy data: which definition each card deploys and how it appears in the pool.
// Costs follow the category bands in DESIGN.md: defensive structures 8-14, units 10-18, abilities 12-20.
import type { CardDef } from '../types';

export const CARDS: readonly CardDef[] = [
  // Structures (11)
  { id: 'outpost', category: 'structure', rarity: 'rare', cost: 12, weight: 45 },
  { id: 'machine_gun_turret', category: 'structure', rarity: 'common', cost: 10, weight: 85 },
  { id: 'heavy_cannon', category: 'structure', rarity: 'uncommon', cost: 13, weight: 40 },
  { id: 'mortar', category: 'structure', rarity: 'uncommon', cost: 12, weight: 40 },
  { id: 'rocket_launcher', category: 'structure', rarity: 'uncommon', cost: 13, weight: 35 },
  { id: 'flamethrower', category: 'structure', rarity: 'common', cost: 8, weight: 45 },
  { id: 'repair_tower', category: 'structure', rarity: 'uncommon', cost: 8, weight: 35 },
  { id: 'radar_tower', category: 'structure', rarity: 'uncommon', cost: 10, weight: 30 },
  { id: 'mine_layer', category: 'structure', rarity: 'uncommon', cost: 9, weight: 35 },
  { id: 'emp_defense', category: 'structure', rarity: 'rare', cost: 14, weight: 25 },
  { id: 'anti_air_turret', category: 'structure', rarity: 'uncommon', cost: 12, weight: 40 },

  // Units (10)
  { id: 'scout_buggy', category: 'unit', rarity: 'common', cost: 10, weight: 70 },
  { id: 'assault_buggy', category: 'unit', rarity: 'common', cost: 11, weight: 75 },
  { id: 'autonomous_apc', category: 'unit', rarity: 'uncommon', cost: 14, weight: 50 },
  { id: 'medium_tank', category: 'unit', rarity: 'common', cost: 15, weight: 90 },
  { id: 'heavy_tank', category: 'unit', rarity: 'power', cost: 18, weight: 30 },
  { id: 'rocket_truck', category: 'unit', rarity: 'uncommon', cost: 14, weight: 40 },
  { id: 'siege_tank', category: 'unit', rarity: 'power', cost: 17, weight: 30 },
  { id: 'repair_vehicle', category: 'unit', rarity: 'uncommon', cost: 11, weight: 40 },
  { id: 'automated_walker', category: 'unit', rarity: 'uncommon', cost: 12, weight: 50 },
  { id: 'drone_swarm', category: 'unit', rarity: 'uncommon', cost: 12, weight: 45 },

  // Abilities (5)
  { id: 'artillery_strike', category: 'ability', rarity: 'power', cost: 18, weight: 40 },
  { id: 'emp_pulse', category: 'ability', rarity: 'uncommon', cost: 14, weight: 35 },
  { id: 'smoke_screen', category: 'ability', rarity: 'uncommon', cost: 12, weight: 40 },
  { id: 'emergency_repair', category: 'ability', rarity: 'uncommon', cost: 13, weight: 35 },
  { id: 'missile_strike', category: 'ability', rarity: 'power', cost: 16, weight: 30 },
];
