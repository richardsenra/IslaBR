import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import { MSG, ROOM } from '@islabr/shared';
import { createGameServer } from '../app.js';
import { conectar, migrar, urlDoBanco } from '../db/index.js';
import { MemoryStore, PostgresStore, definirStore, type PlayerStore } from '../store/index.js';
import type { IslandRoom } from './IslandRoom.js';
import { ate, completarM01, escutar, falar, irAte, respirar } from './testHelpers.js';

/**
 * Critério de aceite do M2: "recarregar a página mantém o progresso".
 *
 * Recarregar a página, do ponto de vista do servidor, é sair e voltar com o
 * mesmo token de convidado. A bateria roda com o progresso em memória e, se
 * houver DATABASE_URL, também contra o Postgres.
 */

function testarPersistencia(nome: string, montar: () => Promise<PlayerStore>): void {
  describe(nome, () => {
    let colyseus: ColyseusTestServer;
    let store: PlayerStore;

    beforeAll(async () => {
      store = await montar();
      definirStore(store);
      colyseus = await boot(createGameServer());
    });

    afterAll(async () => {
      await colyseus.shutdown();
      await store.encerrar();
      definirStore(new MemoryStore());
    });

    afterEach(async () => {
      await colyseus.cleanup();
    });

    it('sai e volta com o mesmo token: a m01 continua feita', async () => {
      const token = `volta_${Date.now()}_${Math.random()}`;
      const sala = await colyseus.createRoom<IslandRoom>(ROOM.island);

      const primeira = await colyseus.connectTo(sala, { token });
      const caixa1 = escutar(primeira);
      await sala.waitForNextPatch();
      await completarM01(sala, primeira, caixa1, { n: 0 });
      await ate(() => caixa1.inventarios.at(-1)?.moedas === 10, 'as 10 moedas da m01');
      await primeira.leave();
      await respirar();

      // "Recarregar a página": sala nova, mesmo token. A sala antiga some
      // sozinha quando esvazia, e o progresso não mora nela.
      const salaNova = await colyseus.createRoom<IslandRoom>(ROOM.island);
      const segunda = await colyseus.connectTo(salaNova, { token });
      const caixa2 = escutar(segunda);
      segunda.send(MSG.ready, {});

      await ate(() => caixa2.inventarios.length > 0, 'a carteira de volta');
      expect(caixa2.inventarios.at(-1)).toMatchObject({
        moedas: 10,
        coracoes: 3,
        coracoesMax: 3,
      });
      expect(caixa2.inventarios.at(-1)?.itens).toMatchObject({ graveto_reforcado: 1 });

      // A m01 está feita, então a Nara entrega a m02 em vez de recomeçar.
      const fala = await falar(salaNova, segunda, caixa2, 'spot_nara', { n: 0 });
      expect(fala).toMatchObject({ dialogo: 'nara_m02_intro', missao: 'm02' });
    });

    it('o objetivo em andamento volta junto', async () => {
      const token = `meio_${Date.now()}_${Math.random()}`;
      const sala = await colyseus.createRoom<IslandRoom>(ROOM.island);

      const primeira = await colyseus.connectTo(sala, { token });
      const caixa1 = escutar(primeira);
      await sala.waitForNextPatch();
      await falar(sala, primeira, caixa1, 'spot_nara', { n: 0 });
      await falar(sala, primeira, caixa1, 'spot_bento', { n: 0 });
      await ate(
        () => caixa1.missoes.at(-1)?.texto === 'Fale com a Dona Iracema, na vila',
        'o segundo objetivo da m01',
      );
      await primeira.leave();
      await respirar();

      const salaNova = await colyseus.createRoom<IslandRoom>(ROOM.island);
      const segunda = await colyseus.connectTo(salaNova, { token });
      const caixa2 = escutar(segunda);
      segunda.send(MSG.ready, {});

      await ate(() => caixa2.missoes.length > 0, 'o objetivo de volta');
      expect(caixa2.missoes.at(-1)).toMatchObject({
        missao: 'm01',
        texto: 'Fale com a Dona Iracema, na vila',
      });
    });

    it('baú aberto continua aberto depois de voltar (SPEC §4)', async () => {
      const token = `bau_${Date.now()}_${Math.random()}`;
      const sala = await colyseus.createRoom<IslandRoom>(ROOM.island);

      const primeira = await colyseus.connectTo(sala, { token });
      const caixa1 = escutar(primeira);
      await sala.waitForNextPatch();
      await completarM01(sala, primeira, caixa1, { n: 0 });
      // A m02 libera o c01; aceitar, quebrar as caixas e concluir.
      const seq = { n: 0 };
      await falar(sala, primeira, caixa1, 'spot_nara', seq);
      for (let i = 1; i <= 5; i += 1) {
        const antes = caixa1.missoes.length;
        await irAte(sala, primeira, `spot_caixa_${i}`, seq);
        await ate(() => caixa1.missoes.length > antes, `a caixa ${i}`);
      }
      await falar(sala, primeira, caixa1, 'spot_nara', seq);
      await ate(() => caixa1.inventarios.at(-1)?.moedas === 25, 'as 25 moedas');

      await irAte(sala, primeira, 'spot_c01', seq);
      await ate(() => caixa1.inventarios.at(-1)?.moedas === 45, 'as 45 moedas com o baú');
      await primeira.leave();
      await respirar();

      const salaNova = await colyseus.createRoom<IslandRoom>(ROOM.island);
      const segunda = await colyseus.connectTo(salaNova, { token });
      const caixa2 = escutar(segunda);
      segunda.send(MSG.ready, {});
      await ate(() => caixa2.inventarios.length > 0, 'a carteira de volta');
      expect(caixa2.inventarios.at(-1)?.moedas).toBe(45);

      // Abrir de novo não paga segunda vez, mesmo em outra sessão.
      await irAte(salaNova, segunda, 'spot_c01', { n: 0 });
      await respirar(250);
      expect(caixa2.loots).toEqual([]);
      expect(caixa2.inventarios.at(-1)?.moedas).toBe(45);
    });

    it('token diferente é jogador diferente', async () => {
      const sala = await colyseus.createRoom<IslandRoom>(ROOM.island);
      const umToken = `um_${Date.now()}_${Math.random()}`;

      const primeira = await colyseus.connectTo(sala, { token: umToken });
      const caixa1 = escutar(primeira);
      await sala.waitForNextPatch();
      await completarM01(sala, primeira, caixa1, { n: 0 });
      await ate(() => caixa1.inventarios.at(-1)?.moedas === 10, 'as moedas do primeiro');
      await primeira.leave();
      await respirar();

      const salaNova = await colyseus.createRoom<IslandRoom>(ROOM.island);
      const outra = await colyseus.connectTo(salaNova, {
        token: `outro_${Date.now()}_${Math.random()}`,
      });
      const caixa2 = escutar(outra);
      outra.send(MSG.ready, {});
      await ate(() => caixa2.inventarios.length > 0, 'a carteira do segundo');
      expect(caixa2.inventarios.at(-1)?.moedas).toBe(0);
    });

    it('sem token, o jogador entra mas não guarda nada', async () => {
      const sala = await colyseus.createRoom<IslandRoom>(ROOM.island);
      const cliente = await colyseus.connectTo(sala);
      const caixa = escutar(cliente);
      await sala.waitForNextPatch();

      await completarM01(sala, cliente, caixa, { n: 0 });
      await ate(() => caixa.inventarios.at(-1)?.moedas === 10, 'as moedas da sessão');
      expect(caixa.inventarios.at(-1)?.moedas).toBe(10);
    });
  });
}

testarPersistencia('progresso em memória', async () => new MemoryStore());

const url = urlDoBanco();
if (url) {
  testarPersistencia('progresso no Postgres', async () => {
    const conexao = conectar(url);
    await migrar(conexao);
    return new PostgresStore(conexao);
  });
}
