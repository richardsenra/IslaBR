import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import { MSG, ROOM, type ZonesPayload } from '@islabr/shared';
import { createGameServer } from '../app.js';
import type { IslandRoom } from './IslandRoom.js';
import { andarPara, ate, escutar, falar, type Sequencia } from './testHelpers.js';

describe('portões das zonas', () => {
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

  it('a Vila está fechada até aceitar a m01; as outras zonas seguem fechadas', async () => {
    const sala = await colyseus.createRoom<IslandRoom>(ROOM.island);
    const client = await colyseus.connectTo(sala, { token: `portao_${Date.now()}_a` });
    const caixa = escutar(client);
    const zonas: ZonesPayload[] = [];
    client.onMessage(MSG.zones, (m: ZonesPayload) => zonas.push(m));
    const seq: Sequencia = { n: 0 };
    await sala.waitForNextPatch();
    client.send(MSG.ready, {});
    await ate(() => zonas.length > 0, 'a lista de zonas');
    expect(zonas.at(-1)?.zonas).toEqual(['z1']);

    // Encosta no portão da Vila: o servidor recusa o passo para dentro.
    await andarPara(sala, client, 14, 8, seq);
    const antes = caixa.correcoes.length;
    seq.n += 1;
    client.send(MSG.move, {
      seq: seq.n,
      x: 16.3,
      y: 0,
      z: 8,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: 0,
      state: 'idle',
    });
    await ate(() => caixa.correcoes.length > antes, 'a correção do portão da Vila');
    expect(sala.state.players.get(client.sessionId)?.x).toBeLessThan(16);

    // Aceitar a m01 abre a Vila, e só ela.
    await falar(sala, client, caixa, 'spot_nara', seq);
    await ate(() => zonas.at(-1)?.zonas.includes('z2') === true, 'a Vila abrir');
    expect(zonas.at(-1)?.zonas).toEqual(['z1', 'z2']);
    await andarPara(sala, client, 20, 8, seq);
    expect(sala.state.players.get(client.sessionId)?.x).toBeGreaterThan(19);
  }, 30_000);
});
