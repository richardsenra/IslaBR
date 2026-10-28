import { Room, type Client } from '@colyseus/core';
import {
  ARENA_COLLIDERS,
  ARENA_ENEMIES,
  ARENA_TREES,
  ARENA_SPAWN,
  PLUNGE_MIN_HEIGHT,
  ENEMY_RESPAWN_SECONDS,
  INTERACT_RADIUS,
  ISLAND_MAX_PLAYERS,
  MSG,
  SERVER_TICK_MS,
  alturaAcimaDoChao,
  checkMove,
  empurrar,
  empurraoDoGolpe,
  parseAttackPayload,
  parseBuyPayload,
  parseCraftPayload,
  parseEquipPayload,
  parseInteractPayload,
  parseMovePayload,
  parseUseItemPayload,
  spotById,
  type MoveCorrectionPayload,
  type RespawnPayload,
  type Saque,
  type Sorteio,
  type StatusPayload,
} from '@islabr/shared';
import { getEnemy } from '@islabr/content';
import { EnemyState } from './EnemyState.js';
import { TreeState } from './TreeState.js';
import { criarArvore, cortar, passarOTempo, type ArvoreRuntime } from './arvores.js';
import { resolverAtaque } from './combate.js';
import {
  criarInimigo,
  passoDaIA,
  type AlvoDoInimigo,
  type EnemyRuntime,
  type Acao,
} from './enemyAI.js';
import { IslandState, PlayerState } from './IslandState.js';
import { kitDeTeste, todasAsZonasAbertas } from './kitDeTeste.js';
import { PlayerSession, type CompraResult } from './playerSession.js';
import { obterStore, type JogadorSalvo } from '../store/index.js';

/**
 * Instância da ilha (SPEC §4).
 *
 * O cliente simula o próprio movimento e manda o resultado; aqui a posição é
 * conferida contra velocidade máxima, tempo decorrido e os colisores do cenário.
 * Movimento recusado volta para a última posição aceita via `move_correction`.
 *
 * Interação, diálogo, missão e baú são decididos só aqui: o cliente manda o id
 * do alvo e recebe o que o servidor concluiu.
 */
export class IslandRoom extends Room<{ state: IslandState }> {
  override maxClients = ISLAND_MAX_PLAYERS;
  override patchRate = SERVER_TICK_MS;
  override state = new IslandState();

  /** Dados por jogador que não são replicados para a sala. */
  private readonly sessions = new Map<string, PlayerSession>();
  private nextColorIndex = 0;

  /** Inimigos vivos da instância; o estado replicado é o espelho deste. */
  private readonly inimigos = new Map<string, EnemyRuntime>();
  /** Inimigos derrotados esperando a hora de voltar. */
  private readonly arvores = new Map<string, ArvoreRuntime>();

  private readonly renascendo = new Map<string, number>();
  /** Bichos chamados por um mini-chefe: id do invocado → id de quem o chamou. */
  private readonly invocados = new Map<string, string>();
  /** Invocado derrotado some depois de uns segundos, em vez de renascer. */
  private readonly sumindo = new Map<string, number>();
  private proximoInvocado = 1;

  /** Sorteio dos drops. Trocado nos testes por um de semente fixa. */
  protected sorteio: Sorteio = Math.random;

  /** Sobrescrito nos testes para não depender do relógio real. */
  protected now(): number {
    return Date.now();
  }

  override onCreate(): void {
    this.onMessage(MSG.move, (client, raw: unknown) => {
      this.onMove(client, raw);
    });
    this.onMessage(MSG.interact, (client, raw: unknown) => {
      this.onInteract(client, raw);
    });
    this.onMessage(MSG.attack, (client, raw: unknown) => {
      this.onAttack(client, raw);
    });
    this.onMessage(MSG.useItem, (client, raw: unknown) => {
      this.onUseItem(client, raw);
    });
    this.onMessage(MSG.equip, (client, raw: unknown) => {
      this.onEquip(client, raw);
    });
    this.onMessage(MSG.buy, (client, raw: unknown) => {
      this.onBuy(client, raw);
    });
    this.onMessage(MSG.craft, (client, raw: unknown) => {
      this.onCraft(client, raw);
    });
    this.onMessage(MSG.ready, (client) => {
      this.enviarSituacao(client);
    });

    this.povoarInimigos();
    this.povoarArvores();
    // Tick de 20 Hz (SPEC §4).
    this.setSimulationInterval((deltaMs) => {
      this.tick(deltaMs / 1000);
    }, SERVER_TICK_MS);
  }

  private povoarInimigos(): void {
    for (const spawn of ARENA_ENEMIES) {
      const inimigo = criarInimigo(spawn.id, spawn.tipo, spawn.x, spawn.z);
      this.inimigos.set(spawn.id, inimigo);
      this.state.inimigos.set(
        spawn.id,
        new EnemyState({
          tipo: inimigo.tipo,
          x: inimigo.x,
          y: inimigo.y,
          z: inimigo.z,
          yaw: inimigo.yaw,
          hp: inimigo.hp,
          hpMax: inimigo.hp,
          estado: inimigo.estado,
        }),
      );
    }
  }

  private povoarArvores(): void {
    for (const spawn of ARENA_TREES) {
      const arvore = criarArvore(spawn);
      this.arvores.set(arvore.id, arvore);
      this.state.arvores.set(
        arvore.id,
        new TreeState({
          tipo: arvore.tipo,
          x: arvore.x,
          z: arvore.z,
          golpes: arvore.golpes,
          golpesMax: arvore.golpes,
        }),
      );
    }
  }

  /** Um passo da simulação: IA, mordidas e quem volta a viver. */
  private tick(dt: number): void {
    const alvos: AlvoDoInimigo[] = [];
    for (const [sessionId, session] of this.sessions) {
      const estado = this.state.players.get(sessionId);
      if (!estado) continue;
      alvos.push({
        sessionId,
        x: session.aceito.x,
        y: session.aceito.y,
        z: session.aceito.z,
        atacavel: session.vivo,
      });
    }

    // Sala vazia: ninguém para perceber, então a IA espera (o renascimento não).
    if (alvos.length > 0) {
      for (const inimigo of this.inimigos.values()) {
        if (inimigo.estado === 'morto') continue;
        const acao = passoDaIA(inimigo, alvos, dt);
        this.atenderChefe(inimigo);
        this.espelhar(inimigo);
        if (acao) this.agirContraJogadores(acao);
      }
    }

    this.cuidarDoRenascimento(dt);
    this.cuidarDosInvocados(dt);
    this.cuidarDasArvores(dt);

    for (const [sessionId, session] of this.sessions) {
      // Levantar (ou perder os corações emprestados) muda a vida sem que o
      // jogador tenha feito nada: o cliente é avisado aqui.
      if (session.passar(dt)) {
        this.clients
          .find((candidato) => candidato.sessionId === sessionId)
          ?.send(MSG.inventoryUpdate, session.inventario);
      }
      const estado = this.state.players.get(sessionId);
      if (estado) {
        estado.coracoes = session.progress.coracoes;
        estado.arma = session.arma ?? '';
      }
    }
  }

  /** Árvore derrubada volta em pé depois do tempo que o conteúdo diz. */
  private cuidarDasArvores(dt: number): void {
    for (const arvore of passarOTempo(this.arvores.values(), dt)) {
      const estado = this.state.arvores.get(arvore.id);
      if (estado) estado.golpes = arvore.golpes;
    }
  }

  /** Manda os avisos de área do mini-chefe aos clientes e atende o pedido de invocação. */
  private atenderChefe(chefe: EnemyRuntime): void {
    for (const aviso of chefe.avisos.splice(0)) this.broadcast(MSG.telegraph, aviso);

    if (chefe.invocar <= 0) return;
    const quer = chefe.invocar;
    chefe.invocar = 0;
    let vivos = 0;
    for (const [id, dono] of this.invocados) {
      if (dono === chefe.id && this.inimigos.get(id)?.estado !== 'morto') vivos += 1;
    }
    const livres = Math.max(0, chefe.maxInvocados - vivos);
    for (let i = 0; i < Math.min(quer, livres); i += 1) {
      const angulo = Math.random() * Math.PI * 2;
      this.invocarMosquito(
        chefe,
        chefe.x + Math.cos(angulo) * 2.5,
        chefe.z + Math.sin(angulo) * 2.5,
      );
    }
  }

  private invocarMosquito(chefe: EnemyRuntime, x: number, z: number): void {
    const id = `e03_s${this.proximoInvocado}`;
    this.proximoInvocado += 1;
    const inimigo = criarInimigo(id, 'e03', x, z);
    this.inimigos.set(id, inimigo);
    this.invocados.set(id, chefe.id);
    this.state.inimigos.set(
      id,
      new EnemyState({
        tipo: inimigo.tipo,
        x: inimigo.x,
        y: inimigo.y,
        z: inimigo.z,
        yaw: inimigo.yaw,
        hp: inimigo.hp,
        hpMax: inimigo.hp,
        estado: inimigo.estado,
      }),
    );
  }

  /** Tira da sala o invocado derrotado, depois que o corpo teve tempo de sumir na tela. */
  private cuidarDosInvocados(dt: number): void {
    for (const [id, restante] of this.sumindo) {
      const falta = restante - dt;
      if (falta > 0) {
        this.sumindo.set(id, falta);
        continue;
      }
      this.sumindo.delete(id);
      this.invocados.delete(id);
      this.inimigos.delete(id);
      this.state.inimigos.delete(id);
    }
  }

  private cuidarDoRenascimento(dt: number): void {
    for (const [id, restante] of this.renascendo) {
      const falta = restante - dt;
      if (falta > 0) {
        this.renascendo.set(id, falta);
        continue;
      }
      this.renascendo.delete(id);
      const inimigo = this.inimigos.get(id);
      const spawn = ARENA_ENEMIES.find((candidato) => candidato.id === id);
      if (!inimigo || !spawn) continue;
      const novo = criarInimigo(spawn.id, spawn.tipo, spawn.x, spawn.z);
      this.inimigos.set(id, novo);
      this.espelhar(novo);
    }
  }

  /** Copia o inimigo para o estado que a sala replica. */
  private espelhar(inimigo: EnemyRuntime): void {
    const estado = this.state.inimigos.get(inimigo.id);
    if (!estado) return;
    estado.x = inimigo.x;
    estado.y = inimigo.y;
    estado.z = inimigo.z;
    estado.yaw = inimigo.yaw;
    estado.hp = inimigo.hp;
    estado.estado = inimigo.estado;
  }

  /** Carteira e objetivo atual, quando o cliente avisa que está escutando. */
  private enviarSituacao(client: Client): void {
    const session = this.sessions.get(client.sessionId);
    if (!session) return;
    client.send(MSG.inventoryUpdate, session.inventario);
    client.send(MSG.zones, { zonas: [...session.zonas] });
    const ativa = session.missaoAtiva;
    if (ativa) client.send(MSG.questUpdate, ativa);
  }

  override async onJoin(client: Client, options?: unknown): Promise<void> {
    const colorIndex = this.nextColorIndex;
    this.nextColorIndex += 1;

    this.state.players.set(
      client.sessionId,
      new PlayerState({
        x: ARENA_SPAWN.x,
        y: ARENA_SPAWN.y,
        z: ARENA_SPAWN.z,
        yaw: ARENA_SPAWN.yaw,
        state: 'idle',
        seq: 0,
        colorIndex: colorIndex % 256,
      }),
    );

    const aceito = {
      seq: 0,
      x: ARENA_SPAWN.x,
      y: ARENA_SPAWN.y,
      z: ARENA_SPAWN.z,
      atMs: this.now(),
    };

    // Token de convidado (SPEC §4): é por ele que o progresso volta.
    const token = tokenDe(options);
    const salvo = token ? await carregarComAviso(token) : undefined;

    const session = new PlayerSession(aceito, salvo);
    session.darKitDeTeste(kitDeTeste());
    session.atualizarZonas(todasAsZonasAbertas());
    this.sessions.set(client.sessionId, session);
    const estado = this.state.players.get(client.sessionId);
    if (estado) estado.arma = session.arma ?? '';
    // A carteira e o objetivo saem quando o cliente mandar `ready`.
  }

  override onLeave(client: Client): void {
    const session = this.sessions.get(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.sessions.delete(client.sessionId);
    if (session) void this.salvar(session);
  }

  override async onDispose(): Promise<void> {
    // Sala vazia ou servidor caindo: grava quem ainda tem mudança pendente.
    await Promise.all([...this.sessions.values()].map((session) => this.salvar(session)));
  }

  /** Grava o progresso deste jogador, se houver o que gravar. */
  private async salvar(session: PlayerSession): Promise<void> {
    if (!session.sujo || !session.playerId) return;
    session.sujo = false;
    try {
      await obterStore().salvar(session.playerId, session.paraSalvar(), session.book);
    } catch (erro) {
      // Perder a gravação não pode derrubar a partida de quem está jogando.
      session.sujo = true;
      console.error('não deu para salvar o progresso:', erro);
    }
  }

  private onMove(client: Client, raw: unknown): void {
    const player = this.state.players.get(client.sessionId);
    const session = this.sessions.get(client.sessionId);
    if (!player || !session) return;

    const claim = parseMovePayload(raw);
    if (!claim) return;

    const now = this.now();

    const check = checkMove(session.aceito, claim, now, session.colisores);
    if (!check.ok) {
      const correction: MoveCorrectionPayload = {
        seq: session.aceito.seq,
        x: session.aceito.x,
        y: session.aceito.y,
        z: session.aceito.z,
        reason: check.reason ?? 'recusado',
      };
      client.send(MSG.moveCorrection, correction);
      return;
    }

    player.x = claim.x;
    player.y = claim.y;
    player.z = claim.z;
    player.yaw = claim.yaw;
    // Entrar em esquiva dá a invulnerabilidade curta; a recarga é do servidor.
    if (claim.state === 'dodge' && player.state !== 'dodge') session.tentarEsquivar(now);
    // O mergulho só vale caindo de alto; a folga cobre o pacote que chega já
    // com o jogador descendo.
    if (alturaAcimaDoChao(claim.x, claim.y, claim.z, ARENA_COLLIDERS) >= PLUNGE_MIN_HEIGHT - 0.3) {
      session.marcarAlto(now);
    }

    player.state = claim.state;
    player.seq = claim.seq;

    const passo = session.passarPor(claim.x, claim.y, claim.z);
    for (const update of passo.atualizacoes) client.send(MSG.questUpdate, update);
    for (const moeda of passo.moedas) client.send(MSG.coin, { id: moeda.id });
    if (passo.insignias.length > 0) {
      client.send(MSG.loot, {
        de: 'Exploração',
        moedas: 0,
        joias: 0,
        itens: [],
        insignias: passo.insignias,
      });
    }
    if (passo.moedas.length > 0 || passo.insignias.length > 0) {
      client.send(MSG.inventoryUpdate, session.inventario);
      void this.salvar(session);
    }

    session.aceito = {
      seq: claim.seq,
      x: claim.x,
      y: claim.y,
      z: claim.z,
      atMs: now,
    };
  }

  /** O jogador está perto o bastante deste alvo para comprar ou fabricar? */
  private pertoDe(session: PlayerSession, spotId: string): boolean {
    const spot = spotById(spotId);
    if (!spot) return false;
    return Math.hypot(spot.x - session.aceito.x, spot.z - session.aceito.z) <= INTERACT_RADIUS + 2;
  }

  private onBuy(client: Client, raw: unknown): void {
    const session = this.sessions.get(client.sessionId);
    const payload = parseBuyPayload(raw);
    if (!session || !payload) return;
    if (!this.pertoDe(session, 'spot_bento')) {
      client.send(MSG.notice, { codigo: 'longe' });
      return;
    }
    this.responderCompra(client, session, session.comprar(payload.item), 'Loja do Seu Bento');
  }

  private onCraft(client: Client, raw: unknown): void {
    const session = this.sessions.get(client.sessionId);
    const payload = parseCraftPayload(raw);
    if (!session || !payload) return;
    if (!this.pertoDe(session, 'spot_bancada')) {
      client.send(MSG.notice, { codigo: 'longe' });
      return;
    }
    this.responderCompra(
      client,
      session,
      session.fabricar(payload.receita),
      'Bancada do Zé Calango',
    );
  }

  private responderCompra(
    client: Client,
    session: PlayerSession,
    resultado: CompraResult,
    de: string,
  ): void {
    if (!resultado.ok) {
      if (resultado.aviso) client.send(MSG.notice, { codigo: resultado.aviso });
      return;
    }
    for (const update of resultado.atualizacoes ?? []) client.send(MSG.questUpdate, update);
    client.send(MSG.inventoryUpdate, session.inventario);
    void de;
    void this.salvar(session);
  }

  /** Tecla F: o servidor confere a distância antes de qualquer coisa. */
  private onInteract(client: Client, raw: unknown): void {
    const player = this.state.players.get(client.sessionId);
    const session = this.sessions.get(client.sessionId);
    if (!player || !session) return;

    const payload = parseInteractPayload(raw);
    if (!payload) return;

    const spot = spotById(payload.alvo);
    if (!spot) return;

    // Posição vale a última aceita, não a que o cliente alega agora.
    const distance = Math.hypot(
      spot.x - session.aceito.x,
      spot.y - session.aceito.y,
      spot.z - session.aceito.z,
    );
    if (distance > INTERACT_RADIUS + 0.5) return;

    const result = session.interagir(spot);

    if (result.aviso) client.send(MSG.notice, { codigo: result.aviso });
    if (result.painel) client.send(MSG.panel, { tipo: result.painel });
    if (result.dialogo) client.send(MSG.dialogue, result.dialogo);
    for (const update of result.atualizacoes) client.send(MSG.questUpdate, update);
    if (result.ganhos) {
      client.send(MSG.loot, {
        de: result.ganhos.de,
        moedas: result.ganhos.moedas,
        joias: result.ganhos.joias,
        itens: result.ganhos.itens,
      });
    }
    if (result.inventario) client.send(MSG.inventoryUpdate, result.inventario);
    // Aceitar uma missão pode abrir uma zona: o portão some para quem aceitou.
    if (session.atualizarZonas(todasAsZonasAbertas())) {
      client.send(MSG.zones, { zonas: [...session.zonas] });
    }

    // Missão e baú mudam pouco e valem muito: grava assim que muda.
    void this.salvar(session);
  }

  /** Golpe do jogador: o servidor decide quem foi acertado e o que caiu. */
  private onAttack(client: Client, raw: unknown): void {
    const session = this.sessions.get(client.sessionId);
    const estado = this.state.players.get(client.sessionId);
    if (!session || !estado || !session.vivo) return;

    const payload = parseAttackPayload(raw);
    if (!payload) return;
    if (payload.golpe === 'plunge' && !session.podeMergulhar(this.now())) return;
    if (!session.podeAtacar(this.now(), payload.golpe)) return;
    session.registrarGolpe(payload.golpe, this.now());

    this.tentarCortar(client, session, payload.yaw);

    const resultado = resolverAtaque(
      {
        x: session.aceito.x,
        y: session.aceito.y,
        z: session.aceito.z,
        yaw: payload.yaw,
        arma: session.arma,
      },
      payload.golpe,
      [...this.inimigos.values()],
      this.sorteio,
    );

    for (const acerto of resultado.acertos) {
      // O carregado e o mergulho jogam para longe quem sobreviveu a eles.
      const forca = empurraoDoGolpe(payload.golpe);
      if (forca > 0 && acerto.dano > 0 && !acerto.morreu) {
        const novo = empurrar(
          session.aceito,
          payload.yaw,
          acerto.inimigo,
          session.colisores,
          forca,
        );
        acerto.inimigo.x = novo.x;
        acerto.inimigo.z = novo.z;
      }

      this.espelhar(acerto.inimigo);
      this.broadcast(MSG.damage, {
        alvo: acerto.inimigo.id,
        valor: acerto.dano,
        origem: client.sessionId,
        x: acerto.inimigo.x,
        y: acerto.inimigo.y + 1,
        z: acerto.inimigo.z,
        morreu: acerto.morreu,
        euLevei: false,
      });

      if (!acerto.morreu) continue;
      if (this.invocados.has(acerto.inimigo.id)) {
        this.sumindo.set(acerto.inimigo.id, 3);
      } else {
        const volta = getEnemy(acerto.inimigo.tipo).volta_s ?? ENEMY_RESPAWN_SECONDS;
        this.renascendo.set(acerto.inimigo.id, volta);
      }
      this.premiar(client, session, acerto.inimigo.tipo, acerto.saque);
    }

    // O espinhoso devolve o golpe de frente (SPEC §7.6).
    if (resultado.refletido > 0) this.machucar(client, session, resultado.refletido, 'espinho');
  }

  /** Usar um item do inventário: quem decide se pode e o que faz é o servidor. */
  private onUseItem(client: Client, raw: unknown): void {
    const session = this.sessions.get(client.sessionId);
    const estado = this.state.players.get(client.sessionId);
    if (!session || !estado) return;

    const payload = parseUseItemPayload(raw);
    if (!payload) return;

    const resultado = session.usarItem(payload.item);
    if (!resultado.usado) {
      client.send(MSG.notice, { codigo: resultado.recusa });
      return;
    }

    estado.coracoes = session.progress.coracoes;
    client.send(MSG.inventoryUpdate, session.inventario);
    void this.salvar(session);
  }

  /** Trocar a arma da mão: o servidor confere se é arma e se o jogador a tem. */
  private onEquip(client: Client, raw: unknown): void {
    const session = this.sessions.get(client.sessionId);
    const estado = this.state.players.get(client.sessionId);
    if (!session || !estado) return;

    const payload = parseEquipPayload(raw);
    if (!payload || !session.equipar(payload.item)) return;

    estado.arma = session.arma ?? '';
    client.send(MSG.inventoryUpdate, session.inventario);
    void this.salvar(session);
  }

  /**
   * O golpe acertou árvore? Só com machado na mão, e só a mais perto. A madeira
   * é sorteada aqui, no servidor (SPEC §4).
   */
  private tentarCortar(client: Client, session: PlayerSession, yaw: number): void {
    const acerto = cortar(
      {
        x: session.aceito.x,
        y: session.aceito.y,
        z: session.aceito.z,
        yaw,
        arma: session.arma,
      },
      [...this.arvores.values()],
      this.sorteio,
    );
    if (!acerto) return;

    const estado = this.state.arvores.get(acerto.arvore.id);
    if (estado) estado.golpes = acerto.arvore.golpes;

    // O mesmo `damage` dos bichos: o cliente já sabe mostrar número e acerto.
    this.broadcast(MSG.damage, {
      alvo: acerto.arvore.id,
      valor: 1,
      origem: client.sessionId,
      x: acerto.arvore.x,
      y: 1.2,
      z: acerto.arvore.z,
      morreu: acerto.caiu,
      euLevei: false,
    });

    if (!acerto.caiu || !acerto.saque) return;
    if (acerto.saque.moedas > 0 || acerto.saque.itens.length > 0) {
      session.receber(acerto.saque);
      client.send(MSG.loot, {
        de: acerto.recurso.nome,
        moedas: acerto.saque.moedas,
        joias: 0,
        itens: acerto.saque.itens,
      });
      client.send(MSG.inventoryUpdate, session.inventario);
      void this.salvar(session);
    }
  }

  /** Paga o saque e conta a morte para as missões. */
  private premiar(client: Client, session: PlayerSession, tipo: string, saque: Saque | null): void {
    const atualizacoes = session.contarMorte(tipo);
    for (const update of atualizacoes) client.send(MSG.questUpdate, update);

    if (saque && (saque.moedas > 0 || saque.itens.length > 0)) {
      session.receber(saque);
      client.send(MSG.loot, {
        de: getEnemy(tipo).nome,
        moedas: saque.moedas,
        joias: 0,
        itens: saque.itens,
      });
    }
    client.send(MSG.inventoryUpdate, session.inventario);
    void this.salvar(session);
  }

  /** O que um inimigo fez e que chega nos jogadores: mordida, gosma ou choque. */
  private agirContraJogadores(acao: Acao): void {
    const clientePor = (sessionId: string): Client | undefined =>
      this.clients.find((candidato) => candidato.sessionId === sessionId);

    switch (acao.tipo) {
      case 'mordida': {
        const session = this.sessions.get(acao.alvo);
        const client = clientePor(acao.alvo);
        if (session && client) this.machucar(client, session, acao.dano, acao.inimigo);
        return;
      }
      case 'choque': {
        // Choque em área: quem estava perto na hora da descarga leva.
        for (const sessionId of acao.alvos) {
          const session = this.sessions.get(sessionId);
          const client = clientePor(sessionId);
          if (session && client) this.machucar(client, session, acao.dano, acao.inimigo);
        }
        return;
      }
      case 'gosma': {
        // A gosma não machuca: deixa lento. A velocidade é do cliente, mas
        // só diminui, então não há o que conferir no servidor.
        const client = clientePor(acao.alvo);
        if (!client) return;
        const status: StatusPayload = {
          tipo: 'lento',
          segundos: acao.segundos,
          origem: acao.inimigo,
        };
        client.send(MSG.status, status);
        return;
      }
    }
  }

  private machucar(client: Client, session: PlayerSession, dano: number, origem: string): void {
    const sofrido = session.levarDano(dano, this.now());
    if (sofrido <= 0) return;

    const estado = this.state.players.get(client.sessionId);
    if (estado) estado.coracoes = session.progress.coracoes;

    this.broadcast(MSG.damage, {
      alvo: client.sessionId,
      valor: sofrido,
      origem,
      x: session.aceito.x,
      y: session.aceito.y + 1.5,
      z: session.aceito.z,
      morreu: !session.vivo,
      euLevei: false,
    });
    if (!session.vivo) {
      this.renascer(client, session);
      return;
    }
    client.send(MSG.inventoryUpdate, session.inventario);
  }

  /**
   * Sem corações, o jogador renasce na hora no ponto de partida, com a vida
   * cheia. Não há fase deitado: morrer é voltar ao começo.
   */
  private renascer(client: Client, session: PlayerSession): void {
    session.renascer();

    // O servidor muda a posição aceita junto, senão o primeiro passo depois do
    // renascer pareceria um teleporte e seria recusado.
    session.aceito = {
      seq: session.aceito.seq,
      x: ARENA_SPAWN.x,
      y: ARENA_SPAWN.y,
      z: ARENA_SPAWN.z,
      atMs: this.now(),
    };
    const estado = this.state.players.get(client.sessionId);
    if (estado) {
      estado.x = ARENA_SPAWN.x;
      estado.y = ARENA_SPAWN.y;
      estado.z = ARENA_SPAWN.z;
      estado.yaw = ARENA_SPAWN.yaw;
      estado.coracoes = session.progress.coracoes;
    }

    const volta: RespawnPayload = {
      x: ARENA_SPAWN.x,
      y: ARENA_SPAWN.y,
      z: ARENA_SPAWN.z,
      yaw: ARENA_SPAWN.yaw,
    };
    client.send(MSG.respawn, volta);
    client.send(MSG.inventoryUpdate, session.inventario);
    void this.salvar(session);
  }
}

/** O token vem das opções de entrada do cliente; nada mais é aceito. */
function tokenDe(options: unknown): string | null {
  if (typeof options !== 'object' || options === null) return null;
  const token = (options as Record<string, unknown>)['token'];
  if (typeof token !== 'string') return null;
  const limpo = token.trim();
  return limpo.length >= 8 && limpo.length <= 128 ? limpo : null;
}

async function carregarComAviso(token: string): Promise<JogadorSalvo | undefined> {
  try {
    return await obterStore().carregar(token);
  } catch (erro) {
    // Sem progresso salvo o jogador ainda joga; só começa do zero.
    console.error('não deu para carregar o progresso:', erro);
    return undefined;
  }
}
