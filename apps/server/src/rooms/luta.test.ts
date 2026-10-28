/* eslint-disable @typescript-eslint/no-non-null-assertion -- teste: o dado existe por construção */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import type { Room as SDKRoom } from '@colyseus/sdk';
import { content } from '@islabr/content';
import { MSG, ROOM, type BossPayload, type LootPayload } from '@islabr/shared';
import { createGameServer } from '../app.js';
import type { IslandRoom } from './IslandRoom.js';
import { definirKitDeTeste, definirZonasAbertas } from './kitDeTeste.js';
import { ate } from './testHelpers.js';

const nucleo = content.world.guardiao.nucleo;

/** A luta do Guardião na sala de verdade, com um e com quatro jogadores. */
describe('luta contra o Tentáculo-Guardião', () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    definirZonasAbertas(true);
    definirKitDeTeste(['arma_nv2']);
    colyseus = await boot(createGameServer());
  });

  afterAll(async () => {
    definirZonasAbertas(false);
    definirKitDeTeste([]);
    await colyseus.shutdown();
  });

  afterEach(async () => {
    await colyseus.cleanup();
  });

  /** Põe o jogador na sala do chefe, de frente para o núcleo, sem andar até lá. */
  function levarParaOChefe(sala: IslandRoom, client: SDKRoom, lado: number): void {
    const session = sala['sessions'].get(client.sessionId);
    const estado = sala.state.players.get(client.sessionId);
    if (!session || !estado) throw new Error('sem sessão');
    const x = nucleo.x + lado * 1.2;
    const z = nucleo.z + 2.2;
    session.aceito = { ...session.aceito, x, y: 0, z };
    estado.x = x;
    estado.z = z;
  }

  async function conectar(sala: IslandRoom, nome: string): Promise<SDKRoom> {
    const client = await colyseus.connectTo(sala, { token: `luta_${Date.now()}_${nome}` });
    await ate(() => sala.state.players.has(client.sessionId), 'o jogador entrar');
    return client;
  }

  function bater(client: SDKRoom): void {
    // Vira para o núcleo (-z) e dá o golpe; a cadência é checada no servidor.
    client.send(MSG.attack, { golpe: 'attack1', yaw: Math.PI });
  }

  /** Abre a janela do núcleo cortando um tentáculo, como um jogador faria. */
  function cortarUmTentaculo(sala: IslandRoom): void {
    const tentaculo = sala['luta'].tentaculos[0]!;
    tentaculo.hp = 0;
    tentaculo.estado = 'morto';
    sala['luta'].aoMorrer(tentaculo.id);
  }

  it('um jogador sozinho derrota o chefe e ganha a insígnia por não tomar dano', async () => {
    const sala = await colyseus.createRoom<IslandRoom>(ROOM.island);
    const a = await conectar(sala, 'a');
    const loots: LootPayload[] = [];
    a.onMessage(MSG.loot, (m: LootPayload) => loots.push(m));
    const bosses: BossPayload[] = [];
    a.onMessage(MSG.boss, (m: BossPayload) => bosses.push(m));

    levarParaOChefe(sala, a, 0);
    await ate(() => sala['luta'].estado.ativa, 'a luta começar');
    // Sem janela, o golpe passa direto pelo núcleo.
    const antes = sala['luta'].nucleo.hp;
    bater(a);
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(sala['luta'].nucleo.hp).toBe(antes);

    cortarUmTentaculo(sala);
    sala['luta'].nucleo.hp = 2;
    // Fica longe das batidas: os tentáculos só miram quem está na sala, e o teste não esquiva.
    sala['luta'].tentaculos.forEach((t) => (t.estado = 'morto'));
    await ate(() => !sala['luta'].nucleo.invulneravel, 'a janela abrir');
    bater(a);
    await ate(() => sala['luta'].nucleo.estado === 'morto', 'o núcleo cair', 5000);

    await ate(() => loots.some((l) => l.insignias?.includes('b08')), 'a insígnia b08');
    const session = sala['sessions'].get(a.sessionId)!;
    expect(session.book['boss1']?.status).toBe('done');
    expect(session.progress.insignias).toContain('b08');
    expect(bosses.length).toBeGreaterThan(0);
  }, 20_000);

  it('quatro jogadores enfrentam um chefe de vida maior, e um deles sair não trava a luta', async () => {
    const sala = await colyseus.createRoom<IslandRoom>(ROOM.island);
    const jogadores = [
      await conectar(sala, 'a'),
      await conectar(sala, 'b'),
      await conectar(sala, 'c'),
      await conectar(sala, 'd'),
    ];
    jogadores.forEach((jogador, i) => levarParaOChefe(sala, jogador, i - 1.5));
    await ate(() => sala['luta'].estado.ativa, 'a luta começar');
    expect(sala['luta'].estado.hpMax).toBe(138);

    // Um sai no meio da luta.
    const [a, b, c, d] = jogadores as [SDKRoom, SDKRoom, SDKRoom, SDKRoom];
    await d.leave();
    await ate(() => sala.state.players.size === 3, 'o jogador sair');
    expect(sala['luta'].estado.ativa).toBe(true);

    sala['luta'].tentaculos.forEach((t) => (t.estado = 'morto'));
    cortarUmTentaculo(sala);
    sala['luta'].nucleo.hp = 2;
    await ate(() => !sala['luta'].nucleo.invulneravel, 'a janela abrir');
    bater(b);
    await ate(() => sala['luta'].nucleo.estado === 'morto', 'o núcleo cair', 5000);

    for (const jogador of [a, b, c]) {
      const session = sala['sessions'].get(jogador.sessionId)!;
      await ate(() => session.book['boss1']?.status === 'done', 'a vitória chegar em todos');
    }
  }, 30_000);
});
