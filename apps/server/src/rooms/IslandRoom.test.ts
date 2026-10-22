import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import {
  ARENA_SPAWN,
  ISLAND_MAX_PLAYERS,
  MOVE_SPEED,
  MSG,
  ROOM,
  type MoveCorrectionPayload,
  type MovePayload,
} from '@islabr/shared';
import { createGameServer } from '../app.js';
import type { IslandRoom } from './IslandRoom.js';

function move(partial: Partial<MovePayload> = {}): MovePayload {
  return {
    seq: 1,
    x: ARENA_SPAWN.x,
    y: ARENA_SPAWN.y,
    z: ARENA_SPAWN.z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: ARENA_SPAWN.yaw,
    state: 'idle',
    ...partial,
  };
}

describe('sala island', () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    colyseus = await boot(createGameServer());
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  afterEach(async () => {
    await colyseus.cleanup();
  });

  it('conta os jogadores conectados e remove quem sai', async () => {
    const room = await colyseus.createRoom<IslandRoom>(ROOM.island);
    const a = await colyseus.connectTo(room);
    const b = await colyseus.connectTo(room);
    await room.waitForNextPatch();

    expect(room.state.players.size).toBe(2);
    expect(a.state.players.size).toBe(2);
    expect(b.state.players.size).toBe(2);

    await b.leave();
    await a.waitForNextPatch();
    expect(a.state.players.size).toBe(1);
  });

  it('limita a sala a 8 jogadores', async () => {
    const room = await colyseus.createRoom<IslandRoom>(ROOM.island);
    expect(room.maxClients).toBe(ISLAND_MAX_PLAYERS);
  });

  it('nasce no ponto de partida da arena', async () => {
    const room = await colyseus.createRoom<IslandRoom>(ROOM.island);
    const client = await colyseus.connectTo(room);
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId);
    expect(player?.x).toBeCloseTo(ARENA_SPAWN.x, 4);
    expect(player?.z).toBeCloseTo(ARENA_SPAWN.z, 4);
    expect(player?.state).toBe('idle');
  });

  it('dá uma cor diferente para cada jogador que entra', async () => {
    const room = await colyseus.createRoom<IslandRoom>(ROOM.island);
    const a = await colyseus.connectTo(room);
    const b = await colyseus.connectTo(room);
    await room.waitForNextPatch();

    const colorA = room.state.players.get(a.sessionId)?.colorIndex;
    const colorB = room.state.players.get(b.sessionId)?.colorIndex;
    expect(colorA).not.toBe(colorB);
  });

  it('aceita movimento plausível e replica para os outros', async () => {
    const room = await colyseus.createRoom<IslandRoom>(ROOM.island);
    const a = await colyseus.connectTo(room);
    const b = await colyseus.connectTo(room);
    await room.waitForNextPatch();

    const target = ARENA_SPAWN.z - MOVE_SPEED * 0.1;
    // O cliente B só recebe patch quando algo muda: espera antes do envio.
    const seenByB = b.waitForNextPatch();
    a.send(MSG.move, move({ seq: 5, z: target, vz: -MOVE_SPEED, state: 'run' }));
    await room.waitForNextMessage();
    await room.waitForNextPatch();

    expect(room.state.players.get(a.sessionId)?.z).toBeCloseTo(target, 3);
    expect(room.state.players.get(a.sessionId)?.state).toBe('run');
    expect(room.state.players.get(a.sessionId)?.seq).toBe(5);

    // O outro cliente vê o mesmo estado.
    await seenByB;
    expect(b.state.players.get(a.sessionId)?.z).toBeCloseTo(target, 3);
  });

  it('recusa teleporte e manda a última posição aceita', async () => {
    const room = await colyseus.createRoom<IslandRoom>(ROOM.island);
    const client = await colyseus.connectTo(room);
    await room.waitForNextPatch();

    const correction = client.waitForMessage(MSG.moveCorrection) as Promise<MoveCorrectionPayload>;
    client.send(MSG.move, move({ seq: 2, x: 500, z: 500 }));
    const payload = await correction;

    expect(payload.reason).toBe('deslocamento');
    expect(payload.x).toBeCloseTo(ARENA_SPAWN.x, 4);
    expect(payload.z).toBeCloseTo(ARENA_SPAWN.z, 4);

    await room.waitForNextPatch();
    expect(room.state.players.get(client.sessionId)?.x).toBeCloseTo(ARENA_SPAWN.x, 4);
    expect(room.state.players.get(client.sessionId)?.seq).toBe(0);
  });

  it('recusa velocidade impossível', async () => {
    const room = await colyseus.createRoom<IslandRoom>(ROOM.island);
    const client = await colyseus.connectTo(room);
    await room.waitForNextPatch();

    const correction = client.waitForMessage(MSG.moveCorrection) as Promise<MoveCorrectionPayload>;
    client.send(MSG.move, move({ seq: 2, vx: 300 }));
    expect((await correction).reason).toBe('velocidade');
  });

  it('recusa sequência fora de ordem', async () => {
    const room = await colyseus.createRoom<IslandRoom>(ROOM.island);
    const client = await colyseus.connectTo(room);
    await room.waitForNextPatch();

    client.send(MSG.move, move({ seq: 9 }));
    await room.waitForNextMessage();

    const correction = client.waitForMessage(MSG.moveCorrection) as Promise<MoveCorrectionPayload>;
    client.send(MSG.move, move({ seq: 4 }));
    expect((await correction).reason).toBe('sequencia');

    await room.waitForNextPatch();
    expect(room.state.players.get(client.sessionId)?.seq).toBe(9);
  });

  it('ignora pacote malformado sem derrubar a sala', async () => {
    const room = await colyseus.createRoom<IslandRoom>(ROOM.island);
    const client = await colyseus.connectTo(room);
    await room.waitForNextPatch();

    client.send(MSG.move, { seq: 'muito', seremos: true });
    await room.waitForNextMessage();
    await room.waitForNextPatch();

    expect(room.state.players.get(client.sessionId)?.seq).toBe(0);
    expect(room.state.players.size).toBe(1);
  });
});
