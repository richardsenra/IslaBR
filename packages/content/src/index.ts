/**
 * Conteúdo do jogo (SPEC §8).
 *
 * Os JSON de `data/` são a fonte da verdade; aqui eles passam pelos schemas
 * zod antes de virar objeto tipado. Qualquer campo errado estoura no carregar,
 * não no meio da partida.
 */

import zonesData from '../data/zones.json' with { type: 'json' };
import npcsData from '../data/npcs.json' with { type: 'json' };
import questsData from '../data/quests.json' with { type: 'json' };
import chestsData from '../data/chests.json' with { type: 'json' };
import badgesData from '../data/badges.json' with { type: 'json' };
import enemiesData from '../data/enemies.json' with { type: 'json' };
import itemsData from '../data/items.json' with { type: 'json' };
import recipesData from '../data/recipes.json' with { type: 'json' };
import shopData from '../data/shop.json' with { type: 'json' };
import dialoguesData from '../data/dialogues.pt-BR.json' with { type: 'json' };

import {
  badgesFile,
  chestsFile,
  dialoguesFile,
  enemiesFile,
  itemsFile,
  npcsFile,
  questsFile,
  recipesFile,
  shopSchema,
  zonesFile,
  type Badge,
  type Chest,
  type Dialogue,
  type Enemy,
  type Item,
  type Npc,
  type Quest,
  type Recipe,
  type Shop,
  type Zone,
} from './schemas/index.js';

export * from './schemas/index.js';
export { checkReferences, type ContentProblem } from './references.js';

export interface Content {
  readonly zones: readonly Zone[];
  readonly npcs: readonly Npc[];
  readonly quests: readonly Quest[];
  readonly chests: readonly Chest[];
  readonly badges: readonly Badge[];
  readonly enemies: readonly Enemy[];
  readonly items: readonly Item[];
  readonly recipes: readonly Recipe[];
  readonly shop: Shop;
  readonly dialogues: Readonly<Record<string, Dialogue>>;
}

function parse<T>(label: string, schema: { parse: (value: unknown) => T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new Error(`Conteúdo inválido em ${label}: ${describe(error)}`, { cause: error });
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Carrega e valida tudo. Lança se algum arquivo estiver fora do schema. */
export function loadContent(): Content {
  return {
    zones: parse('zones.json', zonesFile, zonesData),
    npcs: parse('npcs.json', npcsFile, npcsData),
    quests: parse('quests.json', questsFile, questsData),
    chests: parse('chests.json', chestsFile, chestsData),
    badges: parse('badges.json', badgesFile, badgesData),
    enemies: parse('enemies.json', enemiesFile, enemiesData),
    items: parse('items.json', itemsFile, itemsData),
    recipes: parse('recipes.json', recipesFile, recipesData),
    shop: parse('shop.json', shopSchema, shopData),
    dialogues: parse('dialogues.pt-BR.json', dialoguesFile, dialoguesData),
  };
}

/** Conteúdo já carregado, para quem só quer ler. */
export const content: Content = loadContent();

function index<T extends { id: string }>(list: readonly T[]): ReadonlyMap<string, T> {
  return new Map(list.map((entry) => [entry.id, entry]));
}

export const zonesById = index(content.zones);
export const npcsById = index(content.npcs);
export const questsById = index(content.quests);
export const chestsById = index(content.chests);
export const badgesById = index(content.badges);
export const enemiesById = index(content.enemies);
export const itemsById = index(content.items);
export const recipesById = index(content.recipes);

function required<T>(map: ReadonlyMap<string, T>, id: string, label: string): T {
  const found = map.get(id);
  if (!found) throw new Error(`${label} desconhecido: ${id}`);
  return found;
}

export const getZone = (id: string): Zone => required(zonesById, id, 'zona');
export const getNpc = (id: string): Npc => required(npcsById, id, 'NPC');
export const getQuest = (id: string): Quest => required(questsById, id, 'missão');
export const getChest = (id: string): Chest => required(chestsById, id, 'baú');
export const getBadge = (id: string): Badge => required(badgesById, id, 'insígnia');
export const getEnemy = (id: string): Enemy => required(enemiesById, id, 'inimigo');
export const getItem = (id: string): Item => required(itemsById, id, 'item');
export const getRecipe = (id: string): Recipe => required(recipesById, id, 'receita');

export function getDialogue(id: string): Dialogue {
  const dialogue = content.dialogues[id];
  if (!dialogue) throw new Error(`diálogo desconhecido: ${id}`);
  return dialogue;
}
