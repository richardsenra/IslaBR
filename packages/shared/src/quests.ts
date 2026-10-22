/**
 * Motor de missões (SPEC §4: "o servidor avança objetivos a partir de eventos").
 *
 * Regra pura: recebe as definições de `packages/content`, o estado do jogador e
 * um evento, e devolve o estado novo. Quem persiste e quem paga a recompensa é
 * o servidor. As definições entram por parâmetro e o tipo vem de `content` só
 * em tempo de compilação, então `shared` continua sem dependência em execução.
 */

import type { Quest, QuestPart } from '@islabr/content';

/** Igual ao `status` da tabela `quests` (SPEC §5). */
export type QuestStatus = 'locked' | 'active' | 'done';

export interface QuestState {
  readonly status: QuestStatus;
  /** Parte atual; as partes andam em ordem. */
  readonly stepIndex: number;
  /** Contadores por parte, do jeito que vão para o jsonb. */
  readonly counters: Readonly<Record<string, number>>;
}

/** Estado de todas as missões de um jogador. Missão ausente é `locked`. */
export type QuestBook = Readonly<Record<string, QuestState>>;

/** Quanto o jogador tem de cada item, para semear objetivos de coleta. */
export type Inventory = Readonly<Record<string, number>>;

export type GameEvent =
  | { readonly tipo: 'talk'; readonly npc: string }
  | { readonly tipo: 'collect'; readonly item: string; readonly qtd?: number }
  | { readonly tipo: 'kill'; readonly inimigo: string }
  | { readonly tipo: 'reach'; readonly ponto: string }
  /** `instancia` separa objetos iguais: 5 caixas diferentes, 3 lanternas. */
  | { readonly tipo: 'use'; readonly objeto: string; readonly instancia?: string }
  | { readonly tipo: 'defeat_boss'; readonly chefe: string };

/** O que o HUD mostra e o que vai no `quest_update` (SPEC §4). */
export interface QuestProgress {
  readonly quest: string;
  readonly titulo: string;
  readonly stepIndex: number;
  readonly texto: string;
  readonly feito: number;
  readonly total: number;
  readonly concluida: boolean;
}

export interface EventOutcome {
  readonly book: QuestBook;
  /** Missões que mudaram, para avisar o cliente. */
  readonly atualizacoes: readonly QuestProgress[];
  readonly concluidas: readonly string[];
}

export interface AcceptOutcome {
  readonly book: QuestBook;
  readonly aceita: boolean;
  /** Zonas que abrem ao aceitar (SPEC §7.1). */
  readonly zonasLiberadas: readonly string[];
  readonly progresso: QuestProgress | null;
}

export const LOCKED: QuestState = { status: 'locked', stepIndex: 0, counters: {} };

/** Dica do NPC aparece depois de 3 min travado (SPEC §7.3). */
export const HINT_DELAY_MS = 3 * 60 * 1000;

type QuestDefs = readonly Quest[];

function findQuest(defs: QuestDefs, id: string): Quest | undefined {
  return defs.find((quest) => quest.id === id);
}

function stateOf(book: QuestBook, id: string): QuestState {
  return book[id] ?? LOCKED;
}

export function isDone(book: QuestBook, id: string): boolean {
  return stateOf(book, id).status === 'done';
}

export function isActive(book: QuestBook, id: string): boolean {
  return stateOf(book, id).status === 'active';
}

/** Quanto falta para a parte terminar. */
export function targetOf(part: QuestPart): number {
  switch (part.objetivo) {
    case 'collect':
    case 'kill':
      return part.qtd;
    case 'use':
      return part.qtd;
    case 'reach':
      return part.pontos.length;
    case 'talk':
    case 'defeat_boss':
      return 1;
  }
}

/** Prefixo dos contadores da parte, para duas partes não se misturarem. */
function keyFor(stepIndex: number, suffix = ''): string {
  return `p${stepIndex}${suffix}`;
}

export function progressOf(
  part: QuestPart,
  stepIndex: number,
  counters: Readonly<Record<string, number>>,
): number {
  if (part.objetivo === 'reach') {
    return part.pontos.filter((ponto) => (counters[keyFor(stepIndex, `.${ponto}`)] ?? 0) > 0)
      .length;
  }
  if (part.objetivo === 'use') {
    const marks = Object.keys(counters).filter((key) =>
      key.startsWith(keyFor(stepIndex, '.')),
    ).length;
    return Math.max(counters[keyFor(stepIndex)] ?? 0, marks);
  }
  return counters[keyFor(stepIndex)] ?? 0;
}

function partDone(part: QuestPart, stepIndex: number, state: QuestState): boolean {
  return progressOf(part, stepIndex, state.counters) >= targetOf(part);
}

/**
 * Coleta já feita antes da missão conta: o jogador pode ter aberto o baú do
 * pedaço de mapa antes de o Tito pedir.
 */
function seedCounters(
  part: QuestPart | undefined,
  stepIndex: number,
  inventory: Inventory,
  counters: Readonly<Record<string, number>>,
): Record<string, number> {
  const next = { ...counters };
  if (part?.objetivo === 'collect') {
    const have = inventory[part.item] ?? 0;
    if (have > 0) next[keyFor(stepIndex)] = Math.min(have, part.qtd);
  }
  return next;
}

function describe(quest: Quest, state: QuestState): QuestProgress {
  const concluida = state.status === 'done';
  const index = concluida ? quest.partes.length - 1 : state.stepIndex;
  const part = quest.partes[index];
  const total = part ? targetOf(part) : 1;
  return {
    quest: quest.id,
    titulo: quest.titulo,
    stepIndex: index,
    texto: part?.texto ?? quest.titulo,
    feito: concluida ? total : part ? progressOf(part, index, state.counters) : 0,
    total,
    concluida,
  };
}

/** Missões que o jogador pode aceitar agora. */
export function availableQuests(defs: QuestDefs, book: QuestBook): string[] {
  return defs
    .filter((quest) => stateOf(book, quest.id).status === 'locked')
    .filter((quest) => quest.requer.every((required) => isDone(book, required)))
    .map((quest) => quest.id);
}

export function canAccept(defs: QuestDefs, book: QuestBook, id: string): boolean {
  const quest = findQuest(defs, id);
  if (!quest) return false;
  if (stateOf(book, id).status !== 'locked') return false;
  return quest.requer.every((required) => isDone(book, required));
}

export function acceptQuest(
  defs: QuestDefs,
  book: QuestBook,
  id: string,
  inventory: Inventory = {},
): AcceptOutcome {
  const quest = findQuest(defs, id);
  if (!quest || !canAccept(defs, book, id)) {
    return { book, aceita: false, zonasLiberadas: [], progresso: null };
  }

  const state: QuestState = {
    status: 'active',
    stepIndex: 0,
    counters: seedCounters(quest.partes[0], 0, inventory, {}),
  };
  // A coleta semeada pode já fechar a primeira parte.
  const settled = settle(quest, state, inventory);

  return {
    book: { ...book, [id]: settled },
    aceita: true,
    zonasLiberadas: quest.libera_ao_aceitar,
    progresso: describe(quest, settled),
  };
}

/** Fecha as partes já satisfeitas e conclui a missão se acabaram todas. */
function settle(quest: Quest, state: QuestState, inventory: Inventory): QuestState {
  let current = state;
  for (;;) {
    const part = quest.partes[current.stepIndex];
    if (!part || !partDone(part, current.stepIndex, current)) return current;

    const nextIndex = current.stepIndex + 1;
    if (nextIndex >= quest.partes.length) {
      return { status: 'done', stepIndex: quest.partes.length - 1, counters: current.counters };
    }
    current = {
      status: 'active',
      stepIndex: nextIndex,
      counters: seedCounters(quest.partes[nextIndex], nextIndex, inventory, current.counters),
    };
  }
}

/** Aplica o contador do evento na parte atual, ou devolve `null` se não serve. */
function countEvent(
  part: QuestPart,
  stepIndex: number,
  state: QuestState,
  event: GameEvent,
): Record<string, number> | null {
  const counters = { ...state.counters };
  const key = keyFor(stepIndex);

  switch (part.objetivo) {
    case 'talk':
      if (event.tipo !== 'talk' || event.npc !== part.npc) return null;
      counters[key] = 1;
      return counters;

    case 'collect': {
      if (event.tipo !== 'collect' || event.item !== part.item) return null;
      const added = Math.max(event.qtd ?? 1, 1);
      counters[key] = Math.min((counters[key] ?? 0) + added, part.qtd);
      return counters;
    }

    case 'kill':
      if (event.tipo !== 'kill' || event.inimigo !== part.inimigo) return null;
      counters[key] = Math.min((counters[key] ?? 0) + 1, part.qtd);
      return counters;

    case 'reach': {
      if (event.tipo !== 'reach') return null;
      const position = part.pontos.indexOf(event.ponto);
      if (position < 0) return null;
      if (counters[keyFor(stepIndex, `.${event.ponto}`)] !== undefined) return null;
      if (part.em_ordem) {
        const reached = progressOf(part, stepIndex, state.counters);
        // Fora de ordem não conta: o trajeto da m12 é uma corrida, não uma lista.
        if (position !== reached) return null;
      }
      counters[keyFor(stepIndex, `.${event.ponto}`)] = 1;
      return counters;
    }

    case 'use': {
      if (event.tipo !== 'use' || event.objeto !== part.objeto) return null;
      if (event.instancia === undefined) {
        counters[key] = Math.min((counters[key] ?? 0) + 1, part.qtd);
        return counters;
      }
      const mark = keyFor(stepIndex, `.${event.instancia}`);
      // Usar a mesma lanterna de novo não conta duas vezes.
      if (counters[mark] !== undefined) return null;
      counters[mark] = 1;
      return counters;
    }

    case 'defeat_boss':
      if (event.tipo !== 'defeat_boss' || event.chefe !== part.chefe) return null;
      counters[key] = 1;
      return counters;
  }
}

/**
 * Passa um evento por todas as missões ativas. Só a parte atual de cada missão
 * recebe progresso: matar caranguejo não adianta a parte de conversar.
 */
export function applyQuestEvent(
  defs: QuestDefs,
  book: QuestBook,
  event: GameEvent,
  inventory: Inventory = {},
): EventOutcome {
  let changed = false;
  const next: Record<string, QuestState> = { ...book };
  const atualizacoes: QuestProgress[] = [];
  const concluidas: string[] = [];

  for (const quest of defs) {
    const state = stateOf(book, quest.id);
    if (state.status !== 'active') continue;

    const part = quest.partes[state.stepIndex];
    if (!part) continue;

    const counters = countEvent(part, state.stepIndex, state, event);
    if (!counters) continue;

    const settled = settle(quest, { ...state, counters }, inventory);
    next[quest.id] = settled;
    changed = true;
    atualizacoes.push(describe(quest, settled));
    if (settled.status === 'done') concluidas.push(quest.id);
  }

  return {
    book: changed ? next : book,
    atualizacoes,
    concluidas,
  };
}

export function questProgress(defs: QuestDefs, book: QuestBook, id: string): QuestProgress | null {
  const quest = findQuest(defs, id);
  if (!quest) return null;
  const state = stateOf(book, id);
  if (state.status === 'locked') return null;
  return describe(quest, state);
}

/** Dica da parte atual, mostrada quando o jogador demora (SPEC §7.3). */
export function hintFor(defs: QuestDefs, book: QuestBook, id: string): string | null {
  const quest = findQuest(defs, id);
  if (!quest) return null;
  const state = stateOf(book, id);
  if (state.status !== 'active') return null;
  return quest.partes[state.stepIndex]?.dica ?? null;
}

/** Tudo que as missões concluídas e aceitas destravaram. */
export function unlocked(
  defs: QuestDefs,
  book: QuestBook,
): {
  zonas: string[];
  outros: string[];
} {
  const zonas = new Set<string>();
  const outros = new Set<string>();

  for (const quest of defs) {
    const status = stateOf(book, quest.id).status;
    if (status === 'locked') continue;
    for (const zone of quest.libera_ao_aceitar) zonas.add(zone);
    if (status !== 'done') continue;
    for (const unlock of quest.libera) outros.add(unlock);
  }

  return { zonas: [...zonas], outros: [...outros] };
}
