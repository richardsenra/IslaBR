import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import type { Room as SDKRoom } from '@colyseus/sdk';
import { MSG, ROOM, type DamagePayload } from '@islabr/shared';
import { createGameServer } from '../app.js';
import type { IslandRoom } from './IslandRoom.js';
import {
  ate,
  completarM01,
  escutar,
  falar,
  irAte,
  respirar,
  type Caixa,
  type Sequencia,
} from './testHelpers.js';

/**
 * Aceite do M3: "derrotar 8 caranguejos conclui a m04".
 *
 * O caminho é o do jogo: aceitar as missões em ordem com os NPCs, colher as
 * frutas da m03, ir até os caranguejos e bater neles pela mensagem `attack`,
 * com o servidor decidindo dano, morte, drop e progresso.
 */
describe('combate e m04', () => {
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

  /** Dá um passo curto na direção do inimigo; o anti-teleporte recusa salto. */
  async function passoAte(
    sala: IslandRoom,
    client: SDKRoom,
    enemyId: string,
    seq: Sequencia,
    distanciaDeGolpe: number,
  ): Promise<boolean> {
    const inimigo = sala.state.inimigos.get(enemyId);
    const jogador = sala.state.players.get(client.sessionId);
    if (!inimigo || !jogador) throw new Error('sala sem jogador ou inimigo');

    const dx = inimigo.x - jogador.x;
    const dz = inimigo.z - jogador.z;
    const falta = Math.hypot(dx, dz);
    if (falta <= distanciaDeGolpe) return false;

    const avanco = Math.min(falta - distanciaDeGolpe + 0.1, 2.5);
    seq.n += 1;
    client.send(MSG.move, {
      seq: seq.n,
      x: jogador.x + (dx / falta) * avanco,
      y: 0,
      z: jogador.z + (dz / falta) * avanco,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: Math.atan2(dx, dz),
      state: 'run',
    });
    await ate(
      () => (sala.state.players.get(client.sessionId)?.seq ?? -1) >= seq.n,
      `o servidor aceitar o passo ${seq.n} rumo a ${enemyId}`,
    );
    return true;
  }

  /**
   * Anda até o inimigo e bate até ele cair. Se o jogador cair antes, espera
   * levantar: o servidor recusa golpe de quem está no chão, e é isso mesmo.
   */
  async function derrubar(
    sala: IslandRoom,
    client: SDKRoom,
    enemyId: string,
    seq: Sequencia,
  ): Promise<void> {
    for (let tentativa = 0; tentativa < 80; tentativa += 1) {
      const inimigo = sala.state.inimigos.get(enemyId);
      const jogador = sala.state.players.get(client.sessionId);
      if (!inimigo || !jogador) throw new Error('sala sem jogador ou inimigo');
      if (inimigo.estado === 'morto') return;

      if (await passoAte(sala, client, enemyId, seq, 1.3)) continue;

      client.send(MSG.attack, {
        golpe: tentativa % 2 === 0 ? 'attack1' : 'attack2',
        yaw: Math.atan2(inimigo.x - jogador.x, inimigo.z - jogador.z),
      });
      await respirar(330);
    }
    throw new Error(`não deu para derrubar ${enemyId}`);
  }

  /** Chega na m04 aceita: m01, m02 e m03 em sequência, como no jogo. */
  async function chegarNaM04(
    sala: IslandRoom,
    client: SDKRoom,
    caixa: Caixa,
    seq: Sequencia,
  ): Promise<void> {
    await completarM01(sala, client, caixa, seq);

    await falar(sala, client, caixa, 'spot_nara', seq); // aceita a m02
    for (let i = 1; i <= 5; i += 1) {
      const antes = caixa.missoes.length;
      await irAte(sala, client, `spot_caixa_${i}`, seq);
      await ate(() => caixa.missoes.length > antes, `a caixa ${i}`);
    }
    await falar(sala, client, caixa, 'spot_nara', seq); // conclui a m02

    // m03: 6 frutas na horta e voltar ao Seu Bento.
    await falar(sala, client, caixa, 'spot_bento', seq);
    for (let i = 1; i <= 6; i += 1) {
      const antes = caixa.missoes.length;
      await irAte(sala, client, `spot_fruta_${i}`, seq);
      await ate(() => caixa.missoes.length > antes, `a fruta ${i}`);
    }
    await falar(sala, client, caixa, 'spot_bento', seq); // conclui a m03
    await falar(sala, client, caixa, 'spot_bento', seq); // aceita a m04
    await ate(() => caixa.missoes.at(-1)?.missao === 'm04', 'a m04 começar');
  }

  it('oito caranguejos derrotados concluem a m04 (aceite do M3)', async () => {
    const sala = await colyseus.createRoom<IslandRoom>(ROOM.island);
    const client = await colyseus.connectTo(sala, { token: `m04_${Date.now()}_aceite` });
    const caixa = escutar(client);
    const seq: Sequencia = { n: 0 };
    await sala.waitForNextPatch();

    await chegarNaM04(sala, client, caixa, seq);
    expect(caixa.missoes.at(-1)).toMatchObject({
      missao: 'm04',
      titulo: 'Praga de Caranguejos',
      texto: 'Derrote 8 caranguejos na praia',
      feito: 0,
      total: 8,
    });
    const moedasAntes = caixa.inventarios.at(-1)?.moedas ?? 0;

    // O servidor conta cada morte; o jogador acompanha 1/8, 2/8…
    for (let i = 1; i <= 7; i += 1) {
      await derrubar(sala, client, `e01_${i}`, seq);
      await ate(
        () => caixa.missoes.some((m) => m.missao === 'm04' && m.feito >= i && m.total === 8),
        `a morte ${i} contar para a m04`,
      );
    }

    // A oitava fecha a parte, e a atualização já traz o objetivo seguinte.
    await derrubar(sala, client, 'e01_8', seq);
    await ate(
      () => caixa.missoes.at(-1)?.texto === 'Dê a notícia ao Seu Bento',
      'a oitava morte fechar a parte de combate',
    );

    // Oito mortes fecham a parte de combate e abrem a de avisar o Bento.
    expect(caixa.missoes.at(-1)).toMatchObject({
      missao: 'm04',
      texto: 'Dê a notícia ao Seu Bento',
    });
    expect(caixa.correcoes, 'nenhum movimento foi recusado').toEqual([]);

    const fala = await falar(sala, client, caixa, 'spot_bento', seq);
    expect(fala).toMatchObject({ dialogo: 'bento_m04_fim', motivo: 'conclusao', missao: 'm04' });

    // A recompensa da missão são 25 moedas; os drops dos bichos vêm por cima.
    await ate(
      () => (caixa.inventarios.at(-1)?.moedas ?? 0) >= moedasAntes + 25,
      'as 25 moedas da m04',
    );
    expect(caixa.inventarios.at(-1)?.moedas).toBeGreaterThanOrEqual(moedasAntes + 25);
  }, 180_000);

  it('o servidor manda dano e morte para quem estiver na sala', async () => {
    const sala = await colyseus.createRoom<IslandRoom>(ROOM.island);
    const client = await colyseus.connectTo(sala, { token: `dano_${Date.now()}_sala` });
    const caixa = escutar(client);
    const danos: DamagePayload[] = [];
    client.onMessage(MSG.damage, (m: DamagePayload) => danos.push(m));
    const seq: Sequencia = { n: 0 };
    await sala.waitForNextPatch();

    // Com o graveto na mão (o jogador ganha ele na m01), um golpe tira 1.
    await completarM01(sala, client, caixa, seq);
    await derrubar(sala, client, 'e01_1', seq);

    const golpesNoCaranguejo = danos.filter((d) => d.alvo === 'e01_1');
    expect(golpesNoCaranguejo.length).toBeGreaterThanOrEqual(2);
    expect(golpesNoCaranguejo.every((d) => d.valor === 1)).toBe(true);
    expect(golpesNoCaranguejo.at(-1)?.morreu).toBe(true);
    expect(golpesNoCaranguejo.slice(0, -1).every((d) => !d.morreu)).toBe(true);
  }, 90_000);

  it('sem arma na mão, o golpe acerta mas não machuca', async () => {
    const sala = await colyseus.createRoom<IslandRoom>(ROOM.island);
    const client = await colyseus.connectTo(sala, { token: `desarmado_${Date.now()}_a` });
    const danos: DamagePayload[] = [];
    client.onMessage(MSG.damage, (m: DamagePayload) => danos.push(m));
    const seq: Sequencia = { n: 0 };
    await sala.waitForNextPatch();

    // O jogador novo ainda não ganhou o graveto (ele vem da m01).
    for (let i = 0; i < 12; i += 1) {
      if (!(await passoAte(sala, client, 'e01_1', seq, 1.3))) break;
    }
    const inimigo = sala.state.inimigos.get('e01_1');
    const jogador = sala.state.players.get(client.sessionId);
    if (!inimigo || !jogador) throw new Error('sala sem jogador ou inimigo');

    client.send(MSG.attack, {
      golpe: 'attack1',
      yaw: Math.atan2(inimigo.x - jogador.x, inimigo.z - jogador.z),
    });
    await ate(() => danos.some((d) => d.alvo === 'e01_1'), 'a mensagem de dano');

    expect(danos.find((d) => d.alvo === 'e01_1')).toMatchObject({ valor: 0, morreu: false });
    expect(sala.state.inimigos.get('e01_1')?.hp).toBe(2);
  }, 90_000);

  it('golpe com pacote torto ou direção inválida é ignorado', async () => {
    const sala = await colyseus.createRoom<IslandRoom>(ROOM.island);
    const client = await colyseus.connectTo(sala, { token: `torto_${Date.now()}_a` });
    await sala.waitForNextPatch();

    client.send(MSG.attack, { golpe: 'espadada', yaw: 0 });
    client.send(MSG.attack, { golpe: 'attack1', yaw: Number.NaN });
    client.send(MSG.attack, 42);
    client.send(MSG.attack, null);
    await respirar(250);

    expect(sala.state.players.size).toBe(1);
    expect(sala.state.inimigos.get('e01_1')?.hp).toBe(2);
  });
});
