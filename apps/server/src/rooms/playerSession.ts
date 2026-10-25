/**
 * O que o servidor guarda de cada jogador que não é replicado para a sala.
 *
 * Missão, inventário e baú aberto são do jogador, não da instância: vão por
 * mensagem direta (`quest_update`, `inventory_update`, `loot`), não pelo state
 * do Colyseus, que todo mundo enxerga.
 */

import { content, getChest, getDialogue, getNpc, itemsById } from '@islabr/content';
import {
  CHARGED_MIN_GAP_MS,
  DODGE_COOLDOWN,
  DODGE_INVULN,
  STARTING_PROGRESS,
  addItem,
  proximoGolpe,
  recargaDoGolpeMs,
  acceptQuest,
  applyQuestEvent,
  applyReward,
  availableQuests,
  canAccept,
  itemCount,
  melhorArma,
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
  type AttackKind,
  type NoticeCode,
  type Saque,
} from '@islabr/shared';
import { danoRecebido } from './combate.js';

/** Carência depois de apanhar, para não levar dois golpes no mesmo instante. */
const INVULNERAVEL_APOS_DANO = 0.6;
/** Tempo caído antes de voltar com os corações cheios. */
const RENASCER_SEGUNDOS = 3;
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

  /** Enquanto maior que zero, o jogador não leva dano (SPEC §6). */
  private invulneravelAte = 0;
  private renascerEm = 0;
  private esquivaLiberadaEm = 0;
  /** Segundos que faltam para os corações temporários da Poção Heróica sumirem. */
  private temporariosRestantes = 0;
  /** Coletáveis já colhidos nesta sessão; renascem na próxima. */
  private readonly coletados = new Set<string>();
  private ultimoGolpe: AttackKind | null = null;
  private ultimoGolpeEm = 0;
  private proximoGolpePermitidoEm = 0;

  constructor(aceito: AcceptedMove, salvo?: JogadorSalvo) {
    this.aceito = aceito;
    this.playerId = salvo?.id ?? '';
    this.progress = salvo?.progress ?? STARTING_PROGRESS;
    this.book = salvo?.book ?? {};
  }

  /** Arma na mão: a melhor que o jogador tiver (SPEC §7.7). */
  get arma(): string | null {
    return melhorArma(this.progress.itens);
  }

  /**
   * Itens de teste, dados na entrada a quem ainda não os tem. Só vale quando o
   * dono do servidor liga o kit (ISLABR_KIT_DE_TESTE); um jogo normal não passa
   * por aqui.
   */
  darKitDeTeste(itens: readonly string[]): void {
    for (const item of itens) {
      if (itemCount(this.progress, item) > 0) continue;
      this.progress = addItem(this.progress, item, 1);
      this.sujo = true;
    }
  }

  get temArmadura(): boolean {
    return itemCount(this.progress, 'armadura_nv1') > 0;
  }

  get vivo(): boolean {
    return this.progress.coracoes > 0;
  }

  /** Invulnerabilidade curta da esquiva e do dano levado (SPEC §6). */
  get invulneravel(): boolean {
    return this.invulneravelAte > 0;
  }

  /** Um golpe a cada `ATTACK_SECONDS`; o cliente não acelera isso. */
  podeAtacar(agora: number, golpe: AttackKind): boolean {
    if (agora < this.proximoGolpePermitidoEm) return false;
    // O carregado exige o tempo de ter sido segurado (ver CHARGED_MIN_GAP_MS).
    if (golpe === 'charged' && agora - this.ultimoGolpeEm < CHARGED_MIN_GAP_MS) return false;
    return true;
  }

  registrarGolpe(golpe: AttackKind, agora: number): void {
    this.ultimoGolpe = golpe;
    this.ultimoGolpeEm = agora;
    this.proximoGolpePermitidoEm = agora + recargaDoGolpeMs(golpe);
  }

  /** Qual golpe o combo entrega agora, se o cliente não disser. */
  golpeDaVez(agora: number): AttackKind {
    return proximoGolpe(this.ultimoGolpe, (agora - this.ultimoGolpeEm) / 1000);
  }

  /** Passa o tempo: invulnerabilidade e volta à vida. */
  passar(dt: number): void {
    this.invulneravelAte = Math.max(0, this.invulneravelAte - dt);

    // Os corações da Poção Heróica são emprestados: passado o tempo, o que
    // passar do máximo some, e nunca derruba o jogador por isso.
    if (this.temporariosRestantes > 0) {
      this.temporariosRestantes = Math.max(0, this.temporariosRestantes - dt);
      if (this.temporariosRestantes === 0 && this.progress.coracoes > this.progress.coracoesMax) {
        this.progress = { ...this.progress, coracoes: this.progress.coracoesMax };
        this.sujo = true;
      }
    }
    if (this.vivo || this.renascerEm <= 0) return;
    this.renascerEm -= dt;
    if (this.renascerEm > 0) return;
    this.progress = { ...this.progress, coracoes: this.progress.coracoesMax };
    this.sujo = true;
  }

  /** Dano já decidido pelo servidor. Devolve quanto realmente entrou. */
  levarDano(dano: number, agora: number): number {
    const sofrido = danoRecebido({
      dano,
      invulneravel: this.invulneravel,
      temArmadura: this.temArmadura,
    });
    if (sofrido <= 0) return 0;

    this.progress = {
      ...this.progress,
      coracoes: Math.max(0, this.progress.coracoes - sofrido),
    };
    // Carência depois de apanhar, para não levar dois golpes no mesmo instante.
    this.invulneravelAte = INVULNERAVEL_APOS_DANO;
    this.sujo = true;
    if (!this.vivo) this.renascerEm = RENASCER_SEGUNDOS;
    void agora;
    return sofrido;
  }

  /**
   * Esquiva: invulnerabilidade curta (SPEC §6). O servidor não vê o botão, vê o
   * personagem entrar em `dodge`; por isso é ele quem impõe a recarga de 1,2 s.
   * Sem isso, um cliente adulterado mandaria `dodge` em loop e nunca levaria dano.
   * Devolve se a invulnerabilidade foi concedida.
   */
  tentarEsquivar(agora: number): boolean {
    if (agora < this.esquivaLiberadaEm) return false;
    this.esquivaLiberadaEm = agora + DODGE_COOLDOWN * 1000;
    this.invulneravelAte = Math.max(this.invulneravelAte, DODGE_INVULN);
    return true;
  }

  /** Conta uma morte de inimigo para as missões ativas. */
  contarMorte(tipo: string): QuestUpdatePayload[] {
    return this.evento({ tipo: 'kill', inimigo: tipo });
  }

  /** Guarda o que caiu do inimigo e conta para objetivos de coleta. */
  receber(saque: Saque): QuestUpdatePayload[] {
    const atualizacoes: QuestUpdatePayload[] = [];
    if (saque.moedas > 0) {
      this.progress = { ...this.progress, moedas: this.progress.moedas + saque.moedas };
      this.sujo = true;
    }
    for (const item of saque.itens) {
      const def = itemsById.get(item);
      // O coração pequeno não vai para o inventário: cura assim que é pego.
      if (def?.usa_ao_pegar && def.efeito?.cura_coracoes) {
        this.curar(def.efeito.cura_coracoes);
        continue;
      }
      this.progress = addItem(this.progress, item, 1);
      this.sujo = true;
      atualizacoes.push(...this.evento({ tipo: 'collect', item, qtd: 1 }));
    }
    return atualizacoes;
  }

  /** Cura até o máximo. Não tira os corações temporários de quem os tem. */
  private curar(quanto: number): void {
    const { coracoes, coracoesMax } = this.progress;
    const depois = Math.max(coracoes, Math.min(coracoesMax, coracoes + quanto));
    if (depois === coracoes) return;
    this.progress = { ...this.progress, coracoes: depois };
    this.sujo = true;
  }

  /**
   * Usa um item do inventário (SPEC §4: `use_item`). O servidor confere que o
   * jogador tem o item, que ele é usável e que o efeito faz sentido, e só então
   * gasta. Poção de cura com a vida cheia é recusada em vez de desperdiçada.
   */
  usarItem(id: string): { usado: true } | { usado: false; recusa: NoticeCode } {
    if (itemCount(this.progress, id) <= 0) return { usado: false, recusa: 'nao-tem' };

    const def = itemsById.get(id);
    const efeito = def?.efeito;
    if (!def || def.tipo !== 'consumivel' || !efeito) return { usado: false, recusa: 'nao-usavel' };
    if (!this.vivo) return { usado: false, recusa: 'caido' };

    const temporarios = efeito.coracoes_temporarios ?? 0;
    // "Esse item cura?" é pergunta do item; "quanto cura agora?" depende da vida.
    const itemCura = efeito.cura_tudo === true || (efeito.cura_coracoes ?? 0) > 0;
    if (!itemCura && temporarios <= 0) return { usado: false, recusa: 'nao-usavel' };

    // Poção de cura com a vida cheia não faz nada: recusa em vez de gastar.
    if (temporarios <= 0 && this.progress.coracoes >= this.progress.coracoesMax) {
      return { usado: false, recusa: 'vida-cheia' };
    }

    const cura = efeito.cura_tudo
      ? this.progress.coracoesMax - Math.min(this.progress.coracoes, this.progress.coracoesMax)
      : (efeito.cura_coracoes ?? 0);

    if (cura > 0) this.curar(cura);
    if (temporarios > 0) {
      const teto = this.progress.coracoesMax + temporarios;
      this.progress = {
        ...this.progress,
        coracoes: Math.min(this.progress.coracoes + temporarios, teto),
      };
      this.temporariosRestantes = efeito.duracao_s ?? 60;
    }

    this.progress = {
      ...this.progress,
      itens: { ...this.progress.itens, [id]: itemCount(this.progress, id) - 1 },
    };
    this.sujo = true;
    return { usado: true };
  }

  /** O que vai para o banco: corações temporários não são do jogador. */
  paraSalvar(): PlayerProgress {
    const { coracoes, coracoesMax } = this.progress;
    return coracoes > coracoesMax ? { ...this.progress, coracoes: coracoesMax } : this.progress;
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
      case 'coletavel':
        return this.coletar(spot);
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

  /**
   * Colhe um item do chão (as frutas da horta). Cada pé só dá uma vez por
   * sessão; a planta "renasce" quando o jogador entra de novo, como a erva do
   * pântano (SPEC §7.7). Por isso isto não é gravado no banco.
   */
  private coletar(spot: InteractSpot): InteractResult {
    if (this.coletados.has(spot.id)) return { ...NADA, recusa: 'ja-coletado' };
    this.coletados.add(spot.id);

    this.progress = addItem(this.progress, spot.alvo, 1);
    this.sujo = true;
    const atualizacoes = this.evento({ tipo: 'collect', item: spot.alvo, qtd: 1 });

    return {
      atualizacoes,
      inventario: this.inventario,
      ganhos: {
        de: spot.rotulo,
        moedas: 0,
        joias: 0,
        itens: [spot.alvo],
        insignias: [],
        coracoes: 0,
      },
    };
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
