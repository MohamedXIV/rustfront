import type { AbilityDef, CardDef, Definition, StructureDef, UnitDef } from '../types';
import { ABILITIES } from './abilities';
import { CARDS } from './cards';
import { HEADQUARTERS, STRUCTURES } from './structures';
import { UNITS } from './units';

export { ABILITIES, CARDS, HEADQUARTERS, STRUCTURES, UNITS };

/** Every definition that can appear in play, including the Headquarters (which is not a card). */
export const ALL_DEFINITIONS: readonly Definition[] = [
  ...STRUCTURES,
  HEADQUARTERS,
  ...UNITS,
  ...ABILITIES,
];

const definitionIndex = new Map<string, Definition>(ALL_DEFINITIONS.map((d) => [d.id, d]));
const cardIndex = new Map<string, CardDef>(CARDS.map((c) => [c.id, c]));

export function getDefinition(id: string): Definition {
  const def = definitionIndex.get(id);
  if (!def) throw new Error(`Unknown definition: ${id}`);
  return def;
}

export function getCard(id: string): CardDef {
  const card = cardIndex.get(id);
  if (!card) throw new Error(`Unknown card: ${id}`);
  return card;
}

export function getStructure(id: string): StructureDef {
  const def = getDefinition(id);
  if (def.category !== 'structure') throw new Error(`${id} is not a structure`);
  return def;
}

export function getUnit(id: string): UnitDef {
  const def = getDefinition(id);
  if (def.category !== 'unit') throw new Error(`${id} is not a unit`);
  return def;
}

export function getAbility(id: string): AbilityDef {
  const def = getDefinition(id);
  if (def.category !== 'ability') throw new Error(`${id} is not an ability`);
  return def;
}
