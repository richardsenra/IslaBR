/**
 * O que o servidor guarda de cada jogador que não é replicado para a sala.
 *
 * Missão, inventário e baú aberto são do jogador, não da instância: vão por
 * mensagem direta (`quest_update`, `inventory_update`, `loot`), não pelo state
 * do Colyseus, que todo mundo enxerga.
 */

import { content, getChest, getDialogue, getNpc, getRecipe, itemsById } from '@islabr/content';
import {
  DODGE_COOLDOWN,
  DODGE_INVULN,
  STARTING_PROGRESS,
  addItem,
  MERGULHO_VALIDO_MS,
  intervaloMinimoMs,
  proximoGolpe,
  acceptQuest,
  applyQuestEvent,
  applyReward,
  availableQuests,
  canAccept,
  itemCount,
  armaEmUso,
  ehArma,
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
  type Box,
  ARENA_COLLIDERS,
  colisoresPara,
  zonasAbertas,
  ARENA_COINS,
  ARENA_TRIGGERS,
  COIN_PICKUP_RADIUS,
  type PanelPayload,
} from '@islabr/shared';
import { danoRecebido } from './combate.js';

/** Quanto a chegada de um golpe pode se adiantar por jitter de rede, em ms. */
const FOLGA_DE_REDE_MS = 60;

/** Carência depois de apanhar, para não levar dois golpes no mesmo instante. */
const INVULNERAVEL_APOS_DANO = 0.6;
/** Invulnerabilidade ao renascer, em segundos. */
const INVULNERAVEL_AO_RENASCER = 2;
import type { JogadorSalvo } from '../store/index.js';

const quests = content.quests;

export interface InteractResult {
  readonly dialogo?: DialoguePayload;
  readonly atualizacoes: readonly QuestUpdatePayload[];
  readonly ganhos?: Gains & { readonly de: string };
  readonly inventario?: InventoryUpdatePayload;
  /** Só para teste e log: por que nada aconteceu. */
  readonly recusa?: string;
  /** Painel que o cliente deve abrir (loja, bancada). */
  readonly painel?: PanelPayload['tipo'];
  /** Aviso de recusa para o jogador ler. */
  readonly aviso?: NoticeCode;
}

/** O que mudou quando o jogador andou: gatilhos, insígnias e moedas soltas. */
export interface PassoResult {
  readonly atualizacoes: readonly QuestUpdatePayload[];
  readonly insignias: readonly string[];
  readonly moedas: readonly { readonly id: string; readonly valor: number }[];
}

export interface CompraResult {
  readonly ok: boolean;
  readonly aviso?: NoticeCode;
  readonly atualizacoes?: readonly QuestUpdatePayload[];
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
  /** Zonas que este jogador já pode pisar (SPEC §7.1). */
  zonas: ReadonlySet<string> = new Set();
  /**
   * Colisores que valem para ele: o mundo mais os portões das zonas fechadas.
   * É a mesma lista de sempre, mexida no lugar, para quem guardou a referência.
   */
  readonly colisores: Box[] = [...ARENA_COLLIDERS];

  /** Enquanto maior que zero, o jogador não leva dano (SPEC §6). */
  private invulneravelAte = 0;
  private esquivaLiberadaEm = 0;
  /** Segundos que faltam para os corações temporários da Poção Heróica sumirem. */
  private temporariosRestantes = 0;
  /** Coletáveis já colhidos nesta sessão; renascem na próxima. */
  private readonly coletados = new Set<string>();
  /** Gatilhos em que o jogador está dentro agora: só dispara ao entrar. */
  private readonly dentro = new Set<string>();
  /** Moedas soltas já pegas nesta sessão; voltam na próxima, como as frutas. */
  private readonly moedasPegas = new Set<string>();
  private ultimoGolpe: AttackKind | null = null;
  private ultimoGolpeEm = 0;
  /** Última vez que o jogador foi visto alto o bastante para mergulhar. */
  private altoEm = Number.NEGATIVE_INFINITY;

  constructor(aceito: AcceptedMove, salvo?: JogadorSalvo) {
    this.aceito = aceito;
    this.playerId = salvo?.id ?? '';
    const carregado = salvo?.progress ?? STARTING_PROGRESS;
    // Quem foi salvo sem corações (de quando cair era uma fase, ou de um
    // encerramento no meio de uma queda) volta com a vida cheia, em vez de
    // nascer morto para sempre.
    this.progress =
      carregado.coracoes > 0 ? carregado : { ...carregado, coracoes: carregado.coracoesMax };
    this.book = salvo?.book ?? {};
  }

  /** Arma na mão: a melhor que o jogador tiver (SPEC §7.7). */
  get arma(): string | null {
    return armaEmUso(this.progress.itens, this.progress.armaEquipada);
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

  /**
   * Recalcula as zonas abertas a partir das missões. Devolve `true` quando
   * mudou, para o servidor avisar o cliente.
   */
  atualizarZonas(todasAbertas: boolean): boolean {
    const novas = zonasAbertas(this.book, todasAbertas);
    const igual =
      novas.size === this.zonas.size && [...novas].every((zona) => this.zonas.has(zona));
    if (igual) return false;
    this.zonas = novas;
    this.colisores.length = 0;
    this.colisores.push(...colisoresPara(novas));
    return true;
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

  /**
   * O golpe chega ao servidor no instante do impacto, não do clique, então a
   * cadência é medida entre impactos (ver `intervaloMinimoMs`). A folga cobre o
   * jitter da rede: sem ela, um jogador honesto com um pacote atrasado perderia
   * o golpe seguinte.
   */
  podeAtacar(agora: number, golpe: AttackKind): boolean {
    if (this.ultimoGolpe !== null) {
      const minimo = intervaloMinimoMs(this.ultimoGolpe, golpe) - FOLGA_DE_REDE_MS;
      if (agora - this.ultimoGolpeEm < minimo) return false;
    }
    return true;
  }

  /** Escolhe a arma da mão. Só vale arma que o jogador tem. */
  equipar(itemId: string): boolean {
    if (!ehArma(itemId) || (this.progress.itens[itemId] ?? 0) <= 0) return false;
    this.progress = { ...this.progress, armaEquipada: itemId };
    this.sujo = true;
    return true;
  }

  marcarAlto(agora: number): void {
    this.altoEm = agora;
  }

  /** Esteve alto há pouco: o mergulho que chegar agora é de verdade. */
  podeMergulhar(agora: number): boolean {
    return agora - this.altoEm <= MERGULHO_VALIDO_MS;
  }

  registrarGolpe(golpe: AttackKind, agora: number): void {
    this.ultimoGolpe = golpe;
    this.ultimoGolpeEm = agora;
  }

  /** Qual golpe o combo entrega agora, se o cliente não disser. */
  golpeDaVez(agora: number): AttackKind {
    return proximoGolpe(this.ultimoGolpe, (agora - this.ultimoGolpeEm) / 1000);
  }

  /**
   * Passa o tempo: invulnerabilidade, corações emprestados e volta à vida.
   * Devolve `true` quando os corações mudaram de um jeito que o cliente precisa
   * saber (levantou, ou o efeito da Poção Heróica acabou): o cliente só descobre
   * a vida pela mensagem de inventário, então sem isso ele seguiria achando que
   * o jogador está caído.
   */
  passar(dt: number): boolean {
    let mudou = false;
    this.invulneravelAte = Math.max(0, this.invulneravelAte - dt);

    // Os corações da Poção Heróica são emprestados: passado o tempo, o que
    // passar do máximo some, e nunca derruba o jogador por isso.
    if (this.temporariosRestantes > 0) {
      this.temporariosRestantes = Math.max(0, this.temporariosRestantes - dt);
      if (this.temporariosRestantes === 0 && this.progress.coracoes > this.progress.coracoesMax) {
        this.progress = { ...this.progress, coracoes: this.progress.coracoesMax };
        this.sujo = true;
        mudou = true;
      }
    }
    return mudou;
  }

  /**
   * Morreu e renasce na hora, com a vida cheia (SPEC §6: não há fase deitado).
   * Quem chama também move o jogador para o ponto de volta. Os corações
   * emprestados somem, e uns segundos de invulnerabilidade evitam cair de novo
   * antes de conseguir reagir.
   */
  renascer(): void {
    this.progress = { ...this.progress, coracoes: this.progress.coracoesMax };
    this.temporariosRestantes = 0;
    this.invulneravelAte = INVULNERAVEL_AO_RENASCER;
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
      insignias: this.progress.insignias.length,
      armaEquipada: this.arma,
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
      this.darInsigniasDaMissao(concluida);
    }
    return atualizacoes;
  }

  /** Insígnias cuja condição é concluir esta missão (a b07, com a m09). */
  private darInsigniasDaMissao(missao: string): void {
    for (const badge of content.badges) {
      if (badge.condicao.tipo !== 'missao' || badge.condicao.missao !== missao) continue;
      this.darInsignia(badge.id);
    }
  }

  /** Dá a insígnia uma vez só. Devolve `true` se era nova. */
  private darInsignia(id: string): boolean {
    if (this.progress.insignias.includes(id)) return false;
    this.progress = { ...this.progress, insignias: [...this.progress.insignias, id] };
    this.sujo = true;
    return true;
  }

  /**
   * O jogador andou: confere os gatilhos (missões `reach` e insígnias de
   * exploração) e as moedas soltas. Gatilho só vale ao entrar no raio.
   */
  passarPor(x: number, y: number, z: number): PassoResult {
    const atualizacoes: QuestUpdatePayload[] = [];
    const insignias: string[] = [];

    for (const gatilho of ARENA_TRIGGERS) {
      const perto =
        Math.hypot(gatilho.x - x, gatilho.z - z) <= gatilho.raio && Math.abs(gatilho.y - y) <= 3;
      if (!perto) {
        this.dentro.delete(gatilho.id);
        continue;
      }
      if (this.dentro.has(gatilho.id)) continue;
      this.dentro.add(gatilho.id);
      atualizacoes.push(...this.evento({ tipo: 'reach', ponto: gatilho.id }));
      if (gatilho.insignia && this.darInsignia(gatilho.insignia)) insignias.push(gatilho.insignia);
      for (const badge of content.badges) {
        if (badge.condicao.tipo !== 'reach' || badge.condicao.ponto !== gatilho.id) continue;
        if (this.darInsignia(badge.id)) insignias.push(badge.id);
      }
    }

    const moedas: { id: string; valor: number }[] = [];
    for (const moeda of ARENA_COINS) {
      if (this.moedasPegas.has(moeda.id)) continue;
      if (Math.hypot(moeda.x - x, moeda.z - z) > COIN_PICKUP_RADIUS) continue;
      if (Math.abs(moeda.y - y) > 2) continue;
      this.moedasPegas.add(moeda.id);
      this.progress = { ...this.progress, moedas: this.progress.moedas + moeda.valor };
      this.sujo = true;
      moedas.push({ id: moeda.id, valor: moeda.valor });
    }

    return { atualizacoes, insignias: [...new Set(insignias)], moedas };
  }

  /**
   * O chefe caiu e este jogador estava na sala. Conta para a missão, guarda a
   * vitória no livro (é o que abre o c10) e dá a insígnia b08 a quem não tomou
   * dano nenhum (SPEC §7.5).
   */
  derrotarChefe(
    chefe: string,
    semDano: boolean,
  ): { atualizacoes: QuestUpdatePayload[]; insignias: string[] } {
    const atualizacoes = this.evento({ tipo: 'defeat_boss', chefe });
    this.book = { ...this.book, [chefe]: { status: 'done', stepIndex: 0, counters: {} } };
    const insignias: string[] = [];
    if (semDano) {
      for (const badge of content.badges) {
        if (badge.condicao.tipo !== 'chefe_sem_dano' || badge.condicao.chefe !== chefe) continue;
        if (this.darInsignia(badge.id)) insignias.push(badge.id);
      }
    }
    this.sujo = true;
    return { atualizacoes, insignias };
  }

  /** A loja do Seu Bento abre quando a m03 termina (SPEC §7.7). */
  get lojaAberta(): boolean {
    return this.book['m03']?.status === 'done';
  }

  /** Receita aprendida: missão feita (ou em andamento, a do repelente) ou baú aberto. */
  receitaAprendida(id: string): boolean {
    const origem = getRecipe(id).aprendida_em;
    if (origem.startsWith('c')) return this.progress.bausAbertos.includes(origem);
    const status = this.book[origem]?.status;
    return status === 'done' || (id === 'repelente' && status === 'active');
  }

  /** Compra na loja: o servidor confere o preço no conteúdo e cobra. */
  comprar(item: string): CompraResult {
    if (!this.lojaAberta) return { ok: false, aviso: 'loja-fechada' };
    const entrada = content.shop.itens.find((candidato) => candidato.item === item);
    if (!entrada) return { ok: false, aviso: 'nao-tem' };
    const { moedas, joias, itens } = entrada.custo;
    if (this.progress.moedas < moedas || this.progress.joias < joias) {
      return { ok: false, aviso: 'sem-dinheiro' };
    }
    if (itens.some((exigido) => itemCount(this.progress, exigido.item) < exigido.qtd)) {
      return { ok: false, aviso: 'faltam-itens' };
    }
    let progress: PlayerProgress = {
      ...this.progress,
      moedas: this.progress.moedas - moedas,
      joias: this.progress.joias - joias,
    };
    for (const exigido of itens) {
      progress = {
        ...progress,
        itens: {
          ...progress.itens,
          [exigido.item]: itemCount(progress, exigido.item) - exigido.qtd,
        },
      };
    }
    this.progress = addItem(progress, item, 1);
    this.sujo = true;
    return { ok: true, atualizacoes: this.evento({ tipo: 'collect', item, qtd: 1 }) };
  }

  /** Fabrica na bancada: gasta os ingredientes e entrega o resultado. */
  fabricar(receita: string): CompraResult {
    const def = content.recipes.find((candidata) => candidata.id === receita);
    if (!def) return { ok: false, aviso: 'nao-tem' };
    if (!this.receitaAprendida(receita)) return { ok: false, aviso: 'nao-aprendida' };
    if (def.ingredientes.some((ing) => itemCount(this.progress, ing.item) < ing.qtd)) {
      return { ok: false, aviso: 'faltam-itens' };
    }
    let progress = this.progress;
    for (const ing of def.ingredientes) {
      progress = {
        ...progress,
        itens: { ...progress.itens, [ing.item]: itemCount(progress, ing.item) - ing.qtd },
      };
    }
    this.progress = addItem(progress, def.resultado.item, def.resultado.qtd);
    this.sujo = true;
    const atualizacoes = this.evento({
      tipo: 'collect',
      item: def.resultado.item,
      qtd: def.resultado.qtd,
    });
    // "Fabrique o repelente na bancada" (m08) conta quando o repelente sai.
    if (receita === 'repelente') {
      atualizacoes.push(...this.evento({ tipo: 'use', objeto: 'bancada_calango' }));
    }
    return { ok: true, atualizacoes };
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
    const resultado = this.falarComSemLoja(npcId);
    // Depois da m03 o Seu Bento também atende no balcão.
    return npcId === 'npc_bento' && this.lojaAberta ? { ...resultado, painel: 'loja' } : resultado;
  }

  private falarComSemLoja(npcId: string): InteractResult {
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
    if (spot.alvo === 'bancada_calango') return { atualizacoes: [], painel: 'bancada' };
    if (spot.exige && itemCount(this.progress, spot.exige) === 0) {
      return { atualizacoes: [], aviso: 'sem-chave', recusa: 'sem-chave' };
    }
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
