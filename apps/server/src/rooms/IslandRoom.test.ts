import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import { ISLAND_MAX_PLAYERS, ROOM } from '@islabr/shared';
import { createGameServer } from '../app.js';
import type { IslandRoom } from './IslandRoom.js';

describe('sala island', () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    colyseus = await boot(createGameServer());
  });

  afterAll(async () => {
    await colyseus.shutdown();
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
});
