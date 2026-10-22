import { Room, type Client } from '@colyseus/core';
import {
  ARENA_COLLIDERS,
  ARENA_SPAWN,
  ISLAND_MAX_PLAYERS,
  MSG,
  SERVER_TICK_MS,
  checkMove,
  parseMovePayload,
  type AcceptedMove,
  type MoveCorrectionPayload,
} from '@islabr/shared';
import { IslandState, PlayerState } from './IslandState.js';

/**
 * Instância da ilha (SPEC §4).
 *
 * O cliente simula o próprio movimento e manda o resultado; aqui a posição é
 * conferida contra velocidade máxima, tempo decorrido e os colisores do cenário.
 * Movimento recusado volta para a última posição aceita via `move_correction`.
 */
export class IslandRoom extends Room<{ state: IslandState }> {
  override maxClients = ISLAND_MAX_PLAYERS;
  override patchRate = SERVER_TICK_MS;
  override state = new IslandState();

  /** Última posição aceita por jogador; não é replicada. */
  private readonly accepted = new Map<string, AcceptedMove>();
  private nextColorIndex = 0;

  /** Sobrescrito nos testes para não depender do relógio real. */
  protected now(): number {
    return Date.now();
  }

  override onCreate(): void {
    this.onMessage(MSG.move, (client, raw: unknown) => {
      this.onMove(client, raw);
    });
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

    this.accepted.set(client.sessionId, {
      seq: 0,
      x: ARENA_SPAWN.x,
      y: ARENA_SPAWN.y,
      z: ARENA_SPAWN.z,
      atMs: this.now(),
    });
  }

  override onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.accepted.delete(client.sessionId);
  }

  private onMove(client: Client, raw: unknown): void {
    const player = this.state.players.get(client.sessionId);
    const last = this.accepted.get(client.sessionId);
    if (!player || !last) return;

    const claim = parseMovePayload(raw);
    if (!claim) return;

    const now = this.now();
    const check = checkMove(last, claim, now, ARENA_COLLIDERS);
    if (!check.ok) {
      const correction: MoveCorrectionPayload = {
        seq: last.seq,
        x: last.x,
        y: last.y,
        z: last.z,
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

    this.accepted.set(client.sessionId, {
      seq: claim.seq,
      x: claim.x,
      y: claim.y,
      z: claim.z,
      atMs: now,
    });
  }
}
