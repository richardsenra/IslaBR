import { Room, type Client } from '@colyseus/core';
import {
  ARENA_COLLIDERS,
  ARENA_SPAWN,
  INTERACT_RADIUS,
  ISLAND_MAX_PLAYERS,
  MSG,
  SERVER_TICK_MS,
  checkMove,
  parseInteractPayload,
  parseMovePayload,
  spotById,
  type MoveCorrectionPayload,
} from '@islabr/shared';
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
    this.onMessage(MSG.ready, (client) => {
      this.enviarSituacao(client);
    });
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
