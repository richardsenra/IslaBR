/**
 * Carteira, inventário e insígnias de um jogador (SPEC §5).
 *
 * Regra pura: só o servidor chama isto, e é ele quem decide moeda, joia, item
 * e baú aberto (SPEC §4). Os valores saem daqui prontos para a tabela
 * `progress` e para as mensagens `inventory_update` e `loot`.
 */

import type { Chest, Reward } from '@islabr/content';

export interface PlayerProgress {
  readonly moedas: number;
  readonly joias: number;
  /** Dano anda de meio em meio coração (SPEC §5). */
  readonly coracoes: number;
  readonly coracoesMax: number;
  readonly itens: Readonly<Record<string, number>>;
  readonly insignias: readonly string[];
  /** Baús que este jogador já abriu; a abertura é por jogador (SPEC §4). */
  readonly bausAbertos: readonly string[];
  /** Arma que o jogador escolheu; `null` usa a melhor que ele tiver. */
  readonly armaEquipada: string | null;
}

/** Começa com 3 corações (SPEC §5). */
export const STARTING_HEARTS = 3;
/** Teto nesta ilha, alcançado com a m06 (SPEC §7.4). */
export const MAX_HEARTS_ISLAND = 4;

export const STARTING_PROGRESS: PlayerProgress = {
  moedas: 0,
  joias: 0,
  coracoes: STARTING_HEARTS,
  coracoesMax: STARTING_HEARTS,
  itens: {},
  insignias: [],
  bausAbertos: [],
  armaEquipada: null,
};

/** O que o jogador acabou de ganhar, para a mensagem `loot`. */
export interface Gains {
  readonly moedas: number;
  readonly joias: number;
  readonly itens: readonly string[];
  readonly insignias: readonly string[];
  readonly coracoes: number;
}

const NOTHING: Gains = { moedas: 0, joias: 0, itens: [], insignias: [], coracoes: 0 };

export function itemCount(progress: PlayerProgress, item: string): number {
  return progress.itens[item] ?? 0;
}

export function addItem(progress: PlayerProgress, item: string, qtd = 1): PlayerProgress {
  if (qtd <= 0) return progress;
  return { ...progress, itens: { ...progress.itens, [item]: itemCount(progress, item) + qtd } };
}

/**
 * Paga uma recompensa de missão ou o conteúdo de um baú. Corações extras sobem
 * o máximo e curam junto, até o teto da ilha.
 */
export function applyReward(
  progress: PlayerProgress,
  reward: Reward,
): { progress: PlayerProgress; ganhos: Gains } {
  const itens = { ...progress.itens };
  for (const item of reward.itens) {
    itens[item] = (itens[item] ?? 0) + 1;
  }

  const insignias = [...progress.insignias];
  const novasInsignias: string[] = [];
  for (const badge of reward.insignias) {
    if (insignias.includes(badge)) continue;
    insignias.push(badge);
    novasInsignias.push(badge);
  }

  const coracoesMax = Math.min(progress.coracoesMax + reward.coracoes, MAX_HEARTS_ISLAND);
  const ganhouCoracao = coracoesMax - progress.coracoesMax;

  return {
    progress: {
      ...progress,
      moedas: progress.moedas + reward.moedas,
      joias: progress.joias + reward.joias,
      coracoes: Math.min(progress.coracoes + ganhouCoracao, coracoesMax),
      coracoesMax,
      itens,
      insignias,
    },
    ganhos: {
      moedas: reward.moedas,
      joias: reward.joias,
      itens: [...reward.itens],
      insignias: novasInsignias,
      coracoes: ganhouCoracao,
    },
  };
}

export type ChestRefusal = 'ja-aberto' | 'falta-requisito';

export interface ChestOutcome {
  readonly progress: PlayerProgress;
  readonly ganhos: Gains;
  readonly aberto: boolean;
  readonly recusa?: ChestRefusal;
}

/**
 * Abre um baú para este jogador. Dois jogadores podem abrir o mesmo baú e cada
 * um recebe o conteúdo, mas ninguém abre duas vezes (SPEC §4).
 *
 * `temRequisito` responde se uma exigência do baú está cumprida: item no
 * inventário, missão concluída ou chefe derrotado.
 */
export function openChest(
  progress: PlayerProgress,
  chest: Chest,
  temRequisito: (requisito: string) => boolean,
): ChestOutcome {
  if (progress.bausAbertos.includes(chest.id)) {
    return { progress, ganhos: NOTHING, aberto: false, recusa: 'ja-aberto' };
  }
  if (!chest.requer.every((requisito) => temRequisito(requisito))) {
    return { progress, ganhos: NOTHING, aberto: false, recusa: 'falta-requisito' };
  }

  const { progress: pago, ganhos } = applyReward(progress, chest.conteudo);
  return {
    progress: { ...pago, bausAbertos: [...pago.bausAbertos, chest.id] },
    ganhos,
    aberto: true,
  };
}
