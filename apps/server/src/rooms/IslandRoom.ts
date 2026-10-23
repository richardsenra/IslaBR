import { Room, type Client } from '@colyseus/core';
import {
  ARENA_COLLIDERS,
  ARENA_ENEMIES,
  ARENA_SPAWN,
  ENEMY_RESPAWN_SECONDS,
  INTERACT_RADIUS,
  ISLAND_MAX_PLAYERS,
  MSG,
  SERVER_TICK_MS,
  checkMove,
  parseAttackPayload,
  parseInteractPayload,
  parseMovePayload,
  spotById,
  type MoveCorrectionPayload,
  type Saque,
  type Sorteio,
} from '@islabr/shared';
import { getEnemy } from '@islabr/content';
import { EnemyState } from './EnemyState.js';
import { resolverAtaque } from './combate.js';
import {
  criarInimigo,
  passoDaIA,
  type AlvoDoInimigo,
  type EnemyRuntime,
  type Mordida,
} from './enemyAI.js';
import { IslandState, PlayerState } from './IslandState.js';
import { PlayerSession } from './playerSession.js';
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
  private readonly renascendo = new Map<string, number>();

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
    this.onMessage(MSG.ready, (client) => {
      this.enviarSituacao(client);
    });

    this.povoarInimigos();
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

    for (const inimigo of this.inimigos.values()) {
      if (inimigo.estado === 'morto') continue;
      const mordida = passoDaIA(inimigo, alvos, dt);
      this.espelhar(inimigo);
      if (mordida) this.morder(mordida);
    }

    this.cuidarDoRenascimento(dt);

    for (const [sessionId, session] of this.sessions) {
      session.passar(dt);
      const estado = this.state.players.get(sessionId);
      if (estado) estado.coracoes = session.progress.coracoes;
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
    this.sessions.set(client.sessionId, session);
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
      await obterStore().salvar(session.playerId, session.progress, session.book);
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
    const check = checkMove(session.aceito, claim, now, ARENA_COLLIDERS);
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
    player.state = claim.state;
    player.seq = claim.seq;

    session.aceito = {
      seq: claim.seq,
      x: claim.x,
      y: claim.y,
      z: claim.z,
      atMs: now,
    };
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
    if (!session.podeAtacar(this.now())) return;
    session.registrarGolpe(payload.golpe, this.now());

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
      this.renascendo.set(acerto.inimigo.id, ENEMY_RESPAWN_SECONDS);
      this.premiar(client, session, acerto.inimigo.tipo, acerto.saque);
    }

    // O espinhoso devolve o golpe de frente (SPEC §7.6).
    if (resultado.refletido > 0) this.machucar(client, session, resultado.refletido, 'espinho');
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

  /** Mordida de inimigo em jogador. */
  private morder(mordida: Mordida): void {
    const session = this.sessions.get(mordida.alvo);
    const client = this.clients.find((candidato) => candidato.sessionId === mordida.alvo);
    if (!session || !client) return;
    this.machucar(client, session, mordida.dano, mordida.inimigo);
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
    client.send(MSG.inventoryUpdate, session.inventario);
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
