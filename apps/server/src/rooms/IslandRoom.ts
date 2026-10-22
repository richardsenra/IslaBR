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

  override onJoin(client: Client): void {
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

    const session = new PlayerSession({
      seq: 0,
      x: ARENA_SPAWN.x,
      y: ARENA_SPAWN.y,
      z: ARENA_SPAWN.z,
      atMs: this.now(),
    });
    this.sessions.set(client.sessionId, session);
    // A carteira e o objetivo saem quando o cliente mandar `ready`.
  }

  override onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.sessions.delete(client.sessionId);
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
  }
}
