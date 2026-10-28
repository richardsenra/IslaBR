import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import { getEnemy, getResource } from '@islabr/content';
import {
  ARENA_ENEMIES,
  ARENA_SPAWN,
  ARENA_TREES,
  MSG,
  ROOM,
  type NoticePayload,
  type RespawnPayload,
  type StatusPayload,
} from '@islabr/shared';
import { createGameServer } from '../app.js';
import type { IslandRoom } from './IslandRoom.js';
import { andarPara, ate, chegarNaM04, escutar, respirar, type Sequencia } from './testHelpers.js';

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

  it('a sala nasce povoada com os quatro tipos da superfície, cada um no estado do seu arquétipo', async () => {
    const sala = await colyseus.createRoom<IslandRoom>(ROOM.island);
    expect(sala.state.inimigos.size).toBe(ARENA_ENEMIES.length);

    const tipos = new Set<string>();
    sala.state.inimigos.forEach((inimigo) => tipos.add(inimigo.tipo));
    expect([...tipos].sort()).toEqual(['e01', 'e02', 'e03', 'e04']);

    const mosquito = sala.state.inimigos.get('e03_1');
    const ia = getEnemy('e03').ia;
    expect(mosquito?.estado).toBe('parado');
    // O mosquito já nasce no ar, na altura do JSON.
    expect(mosquito?.y).toBeCloseTo(ia?.tipo === 'voador' ? ia.altura : -1, 3);

    expect(sala.state.inimigos.get('e04_1')?.estado).toBe('parado');
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

    // Atravessa o porto rumo ao pântano e para a uns 8 m do sapo e04_1.
    await andarPara(sala, client, -23, 0, seq, 'perto do sapo');

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
    await andarPara(sala, client, 3, 19, seq, 'perto do caranguejo');
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

  it('quem fica sem corações renasce na hora no ponto de partida, com a vida cheia', async () => {
    const sala = await colyseus.createRoom<IslandRoom>(ROOM.island);
    const client = await colyseus.connectTo(sala, { token: `renasce_${Date.now()}_a` });
    const caixa = escutar(client);
    const voltas: RespawnPayload[] = [];
    client.onMessage(MSG.respawn, (m: RespawnPayload) => voltas.push(m));
    const seq: Sequencia = { n: 0 };
    await sala.waitForNextPatch();

    // Anda um pouco para longe do ponto de partida.
    await andarPara(sala, client, 8, 8, seq, 'longe do ponto de partida');
    expect(sala.state.players.get(client.sessionId)?.x ?? 0).toBeGreaterThan(5);

    // Derruba o jogador como um bicho derrubaria. As duas peças são privadas da
    // sala; o teste só as usa para provocar a morte, que o jogo causa pelo dano.
    const sessao = sala['sessions'].get(client.sessionId);
    const servidorClient = sala.clients.find(
      (candidato) => candidato.sessionId === client.sessionId,
    );
    if (!sessao || !servidorClient) throw new Error('jogador não encontrado na sala');
    sala['machucar'](servidorClient, sessao, 99, 'teste');

    // O servidor manda o ponto de volta, e a vida já chega cheia.
    await ate(() => voltas.length > 0, 'a mensagem de renascer');
    expect(voltas[0]).toMatchObject({ x: ARENA_SPAWN.x, z: ARENA_SPAWN.z });
    await ate(() => caixa.inventarios.at(-1)?.coracoes === 3, 'a vida cheia chegar ao cliente');

    // Na sala, o jogador já está no ponto de partida e vivo.
    const estado = sala.state.players.get(client.sessionId);
    expect(estado?.x).toBeCloseTo(ARENA_SPAWN.x, 3);
    expect(estado?.z).toBeCloseTo(ARENA_SPAWN.z, 3);
    expect(estado?.coracoes).toBe(3);
    expect(sessao.vivo).toBe(true);

    // O que vai para o banco é a vida cheia: recarregar a página não o deixa
    // morto (o bug do F5).
    expect(sessao.paraSalvar().coracoes).toBe(3);

    // Renasce invulnerável: o primeiro dano logo depois não entra.
    sala['machucar'](servidorClient, sessao, 1, 'teste');
    expect(sessao.progress.coracoes).toBe(3);

    // E anda normalmente a partir dali, sem ser puxado de volta.
    seq.n += 1;
    client.send(MSG.move, {
      seq: seq.n,
      x: ARENA_SPAWN.x + 1,
      y: 0,
      z: ARENA_SPAWN.z,
      vx: 5,
      vy: 0,
      vz: 0,
      yaw: 0,
      state: 'run',
    });
    await ate(
      () => sala.state.players.get(client.sessionId)?.seq === seq.n,
      'andar depois de renascer',
    );
    expect(caixa.correcoes).toEqual([]);
  }, 30_000);

  it('machado derruba a árvore e a madeira entra no inventário', async () => {
    const sala = await colyseus.createRoom<IslandRoom>(ROOM.island);
    const client = await colyseus.connectTo(sala, { token: `lenhador_${Date.now()}` });
    const caixa = escutar(client);
    const seq: Sequencia = { n: 0 };
    await sala.waitForNextPatch();

    const arvore = ARENA_TREES[0];
    if (!arvore) throw new Error('a arena precisa de pelo menos uma árvore');
    const recurso = getResource(arvore.tipo);
    expect(sala.state.arvores.size).toBe(ARENA_TREES.length);
    expect(sala.state.arvores.get(arvore.id)?.golpes).toBe(recurso.golpes);

    // O machado precisa estar na mão: o jogador não nasce com um.
    const sessao = sala['sessions'].get(client.sessionId);
    if (!sessao) throw new Error('jogador não encontrado na sala');
    sessao.receber({ moedas: 0, itens: ['machado'] });
    expect(sessao.equipar('machado')).toBe(true);

    // Chega ao pé da árvore e bate de frente para ela.
    await andarPara(sala, client, arvore.x, arvore.z - 1, seq, 'ao pé da árvore');
    for (let golpe = 0; golpe < recurso.golpes; golpe += 1) {
      client.send(MSG.attack, { golpe: 'attack1', yaw: 0 });
      await ate(
        () =>
          (sala.state.arvores.get(arvore.id)?.golpes ?? recurso.golpes) ===
          recurso.golpes - golpe - 1,
        `a árvore perder o golpe ${golpe + 1}`,
      );
      // A cadência do servidor é a mesma do combate: espera a recarga.
      await respirar(400);
    }

    // Caiu: golpes em zero e a madeira chega ao jogador.
    expect(sala.state.arvores.get(arvore.id)?.golpes).toBe(0);
    await ate(
      () => caixa.loots.some((loot) => loot.itens.includes('madeira')),
      'o loot de madeira',
    );
    await ate(
      () => (caixa.inventarios.at(-1)?.itens['madeira'] ?? 0) > 0,
      'a madeira no inventário',
    );
    expect(sessao.paraSalvar().itens['madeira']).toBeGreaterThan(0);
  }, 30_000);

  it('sem machado na mão, bater na árvore não dá madeira', async () => {
    const sala = await colyseus.createRoom<IslandRoom>(ROOM.island);
    const client = await colyseus.connectTo(sala, { token: `sem_machado_${Date.now()}` });
    const caixa = escutar(client);
    const seq: Sequencia = { n: 0 };
    await sala.waitForNextPatch();

    const arvore = ARENA_TREES[0];
    if (!arvore) throw new Error('a arena precisa de pelo menos uma árvore');
    const sessao = sala['sessions'].get(client.sessionId);
    if (!sessao) throw new Error('jogador não encontrado na sala');
    sessao.receber({ moedas: 0, itens: ['arma_nv2'] });

    await andarPara(sala, client, arvore.x, arvore.z - 1, seq, 'ao pé da árvore');
    client.send(MSG.attack, { golpe: 'attack1', yaw: 0 });
    await respirar(300);

    expect(sala.state.arvores.get(arvore.id)?.golpes).toBe(getResource(arvore.tipo).golpes);
    expect(caixa.loots.some((loot) => loot.itens.includes('madeira'))).toBe(false);
  }, 30_000);

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
