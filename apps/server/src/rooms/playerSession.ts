/**
 * O que o servidor guarda de cada jogador que não é replicado para a sala.
 *
 * Missão, inventário e baú aberto são do jogador, não da instância: vão por
 * mensagem direta (`quest_update`, `inventory_update`, `loot`), não pelo state
 * do Colyseus, que todo mundo enxerga.
 */

import { content, getChest, getDialogue, getNpc } from '@islabr/content';
import {
  STARTING_PROGRESS,
  acceptQuest,
  applyQuestEvent,
  applyReward,
  availableQuests,
  canAccept,
  itemCount,
  openChest,
  questProgress,
  type AcceptedMove,
  type DialoguePayload,
  type GameEvent,
  type Gains,
  type InteractSpot,
  type InventoryUpdatePayload,
  type PlayerProgress,
  type QuestBook,
  type QuestProgress,
  type QuestUpdatePayload,
} from '@islabr/shared';
import type { JogadorSalvo } from '../store/index.js';

const quests = content.quests;

export interface InteractResult {
  readonly dialogo?: DialoguePayload;
  readonly atualizacoes: readonly QuestUpdatePayload[];
  readonly ganhos?: Gains & { readonly de: string };
  readonly inventario?: InventoryUpdatePayload;
  /** Só para teste e log: por que nada aconteceu. */
  readonly recusa?: string;
}

const NADA: InteractResult = { atualizacoes: [] };

export class PlayerSession {
  /** Última posição aceita, para o anti-teleporte do M1. */
  aceito: AcceptedMove;
  progress: PlayerProgress;
  book: QuestBook;
  /** Id do jogador guardado; é por ele que o progresso é salvo. */
  readonly playerId: string;
  /** Vira `true` quando há mudança por salvar. */
  sujo = false;

  constructor(aceito: AcceptedMove, salvo?: JogadorSalvo) {
    this.aceito = aceito;
    this.playerId = salvo?.id ?? '';
    this.progress = salvo?.progress ?? STARTING_PROGRESS;
    this.book = salvo?.book ?? {};
  }

  get inventario(): InventoryUpdatePayload {
    return {
      moedas: this.progress.moedas,
      joias: this.progress.joias,
      coracoes: this.progress.coracoes,
      coracoesMax: this.progress.coracoesMax,
      itens: this.progress.itens,
    };
  }

  /** Missão ativa que o HUD mostra: a primeira ainda em andamento. */
  get missaoAtiva(): QuestUpdatePayload | null {
    for (const quest of quests) {
      const progresso = questProgress(quests, this.book, quest.id);
      if (progresso && !progresso.concluida) return toUpdate(progresso);
    }
    return null;
  }

  /** Exigências de baú: item no bolso, missão feita ou chefe derrotado. */
  private cumpre(requisito: string): boolean {
    if (itemCount(this.progress, requisito) > 0) return true;
    return this.book[requisito]?.status === 'done';
  }

  private evento(event: GameEvent): QuestUpdatePayload[] {
    const resultado = applyQuestEvent(quests, this.book, event, this.progress.itens);
    this.book = resultado.book;
    if (resultado.atualizacoes.length > 0) this.sujo = true;

    const atualizacoes = resultado.atualizacoes.map(toUpdate);
    for (const concluida of resultado.concluidas) {
      const quest = quests.find((q) => q.id === concluida);
      if (!quest) continue;
      const { progress } = applyReward(this.progress, quest.recompensa);
      this.progress = progress;
    }
    return atualizacoes;
  }

  /** O jogador apertou F perto de um alvo. */
  interagir(spot: InteractSpot): InteractResult {
    switch (spot.tipo) {
      case 'npc':
        return this.falarCom(spot.alvo);
      case 'objeto':
        return this.usar(spot);
      case 'bau':
        return this.abrirBau(spot.alvo);
    }
  }

  private falarCom(npcId: string): InteractResult {
    const npc = getNpc(npcId);

    // 1. Conversa que fecha ou adianta uma missão em andamento.
    const antes = this.book;
    const atualizacoes = this.evento({ tipo: 'talk', npc: npcId });
    if (atualizacoes.length > 0) {
      const concluida = quests.find(
        (quest) => this.book[quest.id]?.status === 'done' && antes[quest.id]?.status === 'active',
      );
      if (concluida) {
        return {
          dialogo: {
            dialogo: concluida.dialogo_conclusao,
            npc: getDialogue(concluida.dialogo_conclusao).npc,
            missao: concluida.id,
            motivo: 'conclusao',
          },
          atualizacoes,
          inventario: this.inventario,
          ganhos: {
            de: concluida.titulo,
            moedas: concluida.recompensa.moedas,
            joias: concluida.recompensa.joias,
            itens: [...concluida.recompensa.itens],
            insignias: [...concluida.recompensa.insignias],
            coracoes: concluida.recompensa.coracoes,
          },
        };
      }
      return { atualizacoes, dialogo: ocioso(npcId) };
    }

    // 2. Missão nova que este NPC dá.
    const disponivel = availableQuests(quests, this.book).find((id) => {
      const quest = quests.find((q) => q.id === id);
      return quest?.npc === npcId && canAccept(quests, this.book, id);
    });
    if (disponivel) {
      const quest = quests.find((q) => q.id === disponivel);
      const outcome = acceptQuest(quests, this.book, disponivel, this.progress.itens);
      this.book = outcome.book;
      this.sujo = true;
      return {
        dialogo: {
          dialogo: quest?.dialogo_entrada ?? npc.dialogo_ocioso,
          npc: npcId,
          missao: disponivel,
          motivo: 'entrada',
        },
        atualizacoes: outcome.progresso ? [toUpdate(outcome.progresso)] : [],
      };
    }

    // 3. Nada a tratar: fala de ocioso.
    return { ...NADA, dialogo: ocioso(npcId) };
  }

  private usar(spot: InteractSpot): InteractResult {
    const atualizacoes = this.evento({
      tipo: 'use',
      objeto: spot.alvo,
      instancia: spot.id,
    });
    if (atualizacoes.length === 0) return { ...NADA, recusa: 'nada-a-fazer' };
    return { atualizacoes };
  }

  private abrirBau(chestId: string): InteractResult {
    const chest = getChest(chestId);
    const outcome = openChest(this.progress, chest, (requisito) => this.cumpre(requisito));
    if (!outcome.aberto) return { ...NADA, recusa: outcome.recusa ?? 'recusado' };

    this.progress = outcome.progress;
    this.sujo = true;
    // Pegar item de baú conta para objetivo de coleta.
    const atualizacoes: QuestUpdatePayload[] = [];
    for (const item of chest.conteudo.itens) {
      atualizacoes.push(...this.evento({ tipo: 'collect', item, qtd: 1 }));
    }

    return {
      atualizacoes,
      inventario: this.inventario,
      ganhos: { de: chest.local, ...outcome.ganhos },
    };
  }
}

function toUpdate(progresso: QuestProgress): QuestUpdatePayload {
  return {
    missao: progresso.quest,
    titulo: progresso.titulo,
    texto: progresso.texto,
    feito: progresso.feito,
    total: progresso.total,
    concluida: progresso.concluida,
  };
}

function ocioso(npcId: string): DialoguePayload {
  return { dialogo: getNpc(npcId).dialogo_ocioso, npc: npcId, motivo: 'ocioso' };
}
