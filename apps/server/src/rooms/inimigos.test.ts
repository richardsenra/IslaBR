import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import { getEnemy } from '@islabr/content';
import { ARENA_ENEMIES, MSG, ROOM, type NoticePayload, type StatusPayload } from '@islabr/shared';
import { createGameServer } from '../app.js';
import type { IslandRoom } from './IslandRoom.js';
import { andarPara, ate, chegarNaM04, escutar, type Sequencia } from './testHelpers.js';

describe('inimigos na sala', () => {
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

  it('a sala nasce povoada com os cinco tipos, cada um no estado do seu arquétipo', async () => {
    const sala = await colyseus.createRoom<IslandRoom>(ROOM.island);
    expect(sala.state.inimigos.size).toBe(ARENA_ENEMIES.length);

    const tipos = new Set<string>();
    sala.state.inimigos.forEach((inimigo) => tipos.add(inimigo.tipo));
    expect([...tipos].sort()).toEqual(['e01', 'e02', 'e03', 'e04', 'e05']);

    const mosquito = sala.state.inimigos.get('e03_1');
    const ia = getEnemy('e03').ia;
    expect(mosquito?.estado).toBe('parado');
    // O mosquito já nasce no ar, na altura do JSON.
    expect(mosquito?.y).toBeCloseTo(ia?.tipo === 'voador' ? ia.altura : -1, 3);

    expect(sala.state.inimigos.get('e04_1')?.estado).toBe('parado');
    expect(sala.state.inimigos.get('e05_1')?.estado).toBe('flutuando');
  });

  it('o sapo cospe gosma e o servidor avisa só o jogador atingido (lento)', async () => {
    const sala = await colyseus.createRoom<IslandRoom>(ROOM.island);
    const client = await colyseus.connectTo(sala, { token: `gosma_${Date.now()}_a` });
    const status: StatusPayload[] = [];
    client.onMessage(MSG.status, (m: StatusPayload) => status.push(m));
    const outro = await colyseus.connectTo(sala, { token: `gosma_${Date.now()}_b` });
    const dolOutro: StatusPayload[] = [];
    outro.onMessage(MSG.status, (m: StatusPayload) => dolOutro.push(m));
    const seq: Sequencia = { n: 0 };
    await sala.waitForNextPatch();

    // Contorna os caranguejos e o paredão: desce até o norte pelo meio e vai
    // para perto do sapo e1, a 5 m dele.
    await andarPara(sala, client, 0, -8, seq, 'o norte da arena');
    await andarPara(sala, client, 14, -8, seq, 'perto do sapo');

    await ate(() => status.length > 0, 'a gosma do sapo', 15_000);
    const gosma = getEnemy('e04').ia;
    expect(status[0]).toMatchObject({
      tipo: 'lento',
      segundos: gosma?.tipo === 'saltador' ? gosma.lento_segundos : -1,
    });
    expect(['e04_1', 'e04_2']).toContain(status[0]?.origem);

    // Quem ficou longe do sapo não recebe a gosma do outro.
    expect(dolOutro).toEqual([]);
  }, 60_000);

  it('a poção da m03 só cura quem está ferido, e é gasta ao curar (use_item)', async () => {
    const sala = await colyseus.createRoom<IslandRoom>(ROOM.island);
    const client = await colyseus.connectTo(sala, { token: `pocao_${Date.now()}_a` });
    const caixa = escutar(client);
    const avisos: NoticePayload[] = [];
    client.onMessage(MSG.notice, (m: NoticePayload) => avisos.push(m));
    const seq: Sequencia = { n: 0 };
    await sala.waitForNextPatch();

    await chegarNaM04(sala, client, caixa, seq);
    // A m03 paga duas poções pequenas.
    await ate(
      () => caixa.inventarios.at(-1)?.itens['pocao_pequena'] === 2,
      'as duas poções da m03',
    );

    // Com a vida cheia, a poção é recusada e não é gasta.
    client.send(MSG.useItem, { item: 'pocao_pequena' });
    await ate(() => avisos.length > 0, 'a recusa da poção');
    expect(avisos[0]).toEqual({ codigo: 'vida-cheia' });
    expect(caixa.inventarios.at(-1)?.itens['pocao_pequena']).toBe(2);

    // Deixa um caranguejo morder (meio coração).
    await andarPara(sala, client, 9, 9, seq, 'perto do caranguejo');
    await ate(
      () => (caixa.inventarios.at(-1)?.coracoes ?? 3) < 3,
      'a mordida do caranguejo',
      20_000,
    );

    client.send(MSG.useItem, { item: 'pocao_pequena' });
    await ate(() => caixa.inventarios.at(-1)?.itens['pocao_pequena'] === 1, 'a poção ser gasta');
    // Curou até o máximo (ou quase: outra mordida pode ter chegado depois).
    expect(caixa.inventarios.at(-1)?.coracoes).toBeGreaterThanOrEqual(2.5);
    expect(sala.state.players.get(client.sessionId)?.coracoes).toBeGreaterThanOrEqual(2.5);
  }, 120_000);

  it('use_item com pacote torto ou item inventado é ignorado sem derrubar a sala', async () => {
    const sala = await colyseus.createRoom<IslandRoom>(ROOM.island);
    const client = await colyseus.connectTo(sala, { token: `torto_${Date.now()}_b` });
    const avisos: NoticePayload[] = [];
    client.onMessage(MSG.notice, (m: NoticePayload) => avisos.push(m));
    await sala.waitForNextPatch();

    client.send(MSG.useItem, 42);
    client.send(MSG.useItem, { item: 7 });
    client.send(MSG.useItem, {});
    client.send(MSG.useItem, { item: 'x'.repeat(500) });
    client.send(MSG.useItem, { item: 'espada_do_dono_do_servidor' });
    await ate(() => avisos.length > 0, 'a recusa do item inventado');

    expect(avisos[0]).toEqual({ codigo: 'nao-tem' });
    expect(sala.state.players.size).toBe(1);
  });
});
