import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import type { Room as SDKRoom } from '@colyseus/sdk';
import {
  ARENA_SPOTS,
  MSG,
  ROOM,
  spotById,
  type DialoguePayload,
  type InventoryUpdatePayload,
  type LootPayload,
  type MoveCorrectionPayload,
  type MovePayload,
  type QuestUpdatePayload,
} from '@islabr/shared';
import { createGameServer } from '../app.js';
import type { IslandRoom } from './IslandRoom.js';

/** Guarda o que o servidor mandou, para conferir depois. */
interface Caixa {
  readonly dialogos: DialoguePayload[];
  readonly missoes: QuestUpdatePayload[];
  readonly loots: LootPayload[];
  readonly inventarios: InventoryUpdatePayload[];
  readonly correcoes: MoveCorrectionPayload[];
}

function escutar(client: SDKRoom): Caixa {
  const caixa: Caixa = {
    dialogos: [],
    missoes: [],
    loots: [],
    inventarios: [],
    correcoes: [],
  };
  client.onMessage(MSG.dialogue, (m: DialoguePayload) => caixa.dialogos.push(m));
  client.onMessage(MSG.questUpdate, (m: QuestUpdatePayload) => caixa.missoes.push(m));
  client.onMessage(MSG.loot, (m: LootPayload) => caixa.loots.push(m));
  client.onMessage(MSG.inventoryUpdate, (m: InventoryUpdatePayload) => caixa.inventarios.push(m));
  client.onMessage(MSG.moveCorrection, (m: MoveCorrectionPayload) => caixa.correcoes.push(m));
  return caixa;
}

/** Espera uma condição em vez de contar mensagens, que chegam fora de ordem. */
async function ate(condicao: () => boolean, oQue: string, limiteMs = 2000): Promise<void> {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    if (condicao()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`tempo esgotado esperando: ${oQue}`);
}

/** Um descanso curto para o caso em que nada deve acontecer. */
async function respirar(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 120));
}

describe('interação, diálogo e missão na sala', () => {
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

  /**
   * Leva o jogador até o alvo e aperta F. Anda em passos curtos porque o
   * anti-teleporte do servidor recusa salto grande — como deve mesmo.
   */
  async function irAte(
    room: IslandRoom,
    client: SDKRoom,
    spotId: string,
    seq: { n: number },
  ): Promise<void> {
    const spot = spotById(spotId);
    if (!spot) throw new Error(`alvo desconhecido: ${spotId}`);

    for (let passo = 0; passo < 40; passo += 1) {
      const atual = room.state.players.get(client.sessionId);
      if (!atual) throw new Error('jogador sumiu da sala');
      const dx = spot.x - atual.x;
      const dz = spot.z - atual.z;
      const falta = Math.hypot(dx, dz);
      if (falta < 0.05) break;

      const avanco = Math.min(falta, 2.5);
      const destinoX = atual.x + (dx / falta) * avanco;
      const destinoZ = atual.z + (dz / falta) * avanco;
      seq.n += 1;
      const move: MovePayload = {
        seq: seq.n,
        x: destinoX,
        y: spot.y,
        z: destinoZ,
        vx: 0,
        vy: 0,
        vz: 0,
        yaw: Math.atan2(dx, dz),
        state: 'idle',
      };
      client.send(MSG.move, move);
      await ate(
        () => (room.state.players.get(client.sessionId)?.seq ?? -1) >= seq.n,
        `o servidor aceitar o passo ${seq.n} rumo a ${spotId}`,
      );
    }

    client.send(MSG.interact, { alvo: spotId });
  }

  /** Aperta F e espera a próxima fala. */
  async function falar(
    room: IslandRoom,
    client: SDKRoom,
    caixa: Caixa,
    spotId: string,
    seq: { n: number },
  ): Promise<DialoguePayload> {
    const antes = caixa.dialogos.length;
    await irAte(room, client, spotId, seq);
    await ate(() => caixa.dialogos.length > antes, `uma fala ao interagir com ${spotId}`);
    const fala = caixa.dialogos.at(-1);
    if (!fala) throw new Error('fala sumiu');
    return fala;
  }

  async function completarM01eM02(
    room: IslandRoom,
    client: SDKRoom,
    caixa: Caixa,
    seq: { n: number },
  ): Promise<void> {
    await falar(room, client, caixa, 'spot_nara', seq); // aceita m01
    await falar(room, client, caixa, 'spot_bento', seq);
    await falar(room, client, caixa, 'spot_iracema', seq);
    await falar(room, client, caixa, 'spot_nara', seq); // conclui m01
    await falar(room, client, caixa, 'spot_nara', seq); // aceita m02
    for (let i = 1; i <= 5; i += 1) {
      const antes = caixa.missoes.length;
      await irAte(room, client, `spot_caixa_${i}`, seq);
      await ate(() => caixa.missoes.length > antes, `a caixa ${i} contar`);
    }
    await falar(room, client, caixa, 'spot_nara', seq); // conclui m02
  }

  it('a m01 e a m02 fecham de ponta a ponta (aceite do M2)', async () => {
    const room = await colyseus.createRoom<IslandRoom>(ROOM.island);
    const client = await colyseus.connectTo(room);
    const caixa = escutar(client);
    const seq = { n: 0 };
    await room.waitForNextPatch();

    // A Nara entrega a m01.
    expect(await falar(room, client, caixa, 'spot_nara', seq)).toMatchObject({
      dialogo: 'nara_m01_intro',
      npc: 'npc_nara',
      missao: 'm01',
      motivo: 'entrada',
    });
    await ate(() => caixa.missoes.length > 0, 'o primeiro objetivo');
    expect(caixa.missoes.at(-1)).toMatchObject({
      missao: 'm01',
      titulo: 'Bem-vindo à Ilha',
      texto: 'Fale com o Seu Bento, na Vila Aconchego',
      feito: 0,
      total: 1,
      concluida: false,
    });

    // Falar com a Nara de novo não reinicia nada.
    expect(await falar(room, client, caixa, 'spot_nara', seq)).toMatchObject({
      dialogo: 'nara_ocioso',
      motivo: 'ocioso',
    });

    await falar(room, client, caixa, 'spot_bento', seq);
    expect(caixa.missoes.at(-1)).toMatchObject({
      texto: 'Fale com a Dona Iracema, na vila',
    });

    await falar(room, client, caixa, 'spot_iracema', seq);
    expect(caixa.missoes.at(-1)).toMatchObject({
      texto: 'Volte para a Capitã Nara, no porto',
    });

    // Fechar a m01 com a Nara paga 10 moedas e o graveto.
    expect(await falar(room, client, caixa, 'spot_nara', seq)).toMatchObject({
      dialogo: 'nara_m01_fim',
      motivo: 'conclusao',
      missao: 'm01',
    });
    await ate(() => caixa.loots.length > 0, 'a recompensa da m01');
    expect(caixa.loots.at(-1)).toMatchObject({ moedas: 10, itens: ['graveto_reforcado'] });
    await ate(() => caixa.inventarios.at(-1)?.moedas === 10, 'a carteira com 10 moedas');
    expect(caixa.inventarios.at(-1)).toMatchObject({ coracoes: 3, coracoesMax: 3 });

    // A m02 começa na conversa seguinte.
    expect(await falar(room, client, caixa, 'spot_nara', seq)).toMatchObject({
      dialogo: 'nara_m02_intro',
      missao: 'm02',
      motivo: 'entrada',
    });

    // Quebrar as 5 caixas do cais.
    for (let i = 1; i <= 5; i += 1) {
      const antes = caixa.missoes.length;
      await irAte(room, client, `spot_caixa_${i}`, seq);
      await ate(() => caixa.missoes.length > antes, `a caixa ${i} contar`);
      expect(caixa.missoes.at(-1)?.missao).toBe('m02');
    }
    expect(caixa.missoes.at(-1)).toMatchObject({
      texto: 'Conte para a Nara que o cais está limpo',
    });

    // Avisar a Nara fecha a m02 e paga 15 moedas.
    expect(await falar(room, client, caixa, 'spot_nara', seq)).toMatchObject({
      dialogo: 'nara_m02_fim',
      motivo: 'conclusao',
    });
    await ate(() => caixa.inventarios.at(-1)?.moedas === 25, 'a carteira com 25 moedas');
    expect(caixa.correcoes, 'nenhum movimento foi recusado').toEqual([]);
  });

  it('o baú c01 abre depois da m02, e só uma vez', async () => {
    const room = await colyseus.createRoom<IslandRoom>(ROOM.island);
    const client = await colyseus.connectTo(room);
    const caixa = escutar(client);
    const seq = { n: 0 };
    await room.waitForNextPatch();

    // Antes da m02 o baú existe, mas não abre: ele é liberado por ela.
    await irAte(room, client, 'spot_c01', seq);
    await respirar();
    expect(caixa.loots).toEqual([]);

    await completarM01eM02(room, client, caixa, seq);
    const lootsAntes = caixa.loots.length;

    await irAte(room, client, 'spot_c01', seq);
    await ate(() => caixa.loots.length > lootsAntes, 'o conteúdo do baú');
    expect(caixa.loots.at(-1)).toMatchObject({ moedas: 20 });
    await ate(() => caixa.inventarios.at(-1)?.moedas === 45, 'a carteira com 45 moedas');

    // Segunda tentativa não paga de novo (SPEC §4).
    const depois = caixa.loots.length;
    await irAte(room, client, 'spot_c01', seq);
    await respirar();
    expect(caixa.loots.length).toBe(depois);
    expect(caixa.inventarios.at(-1)?.moedas).toBe(45);
  });

  it('não dá para interagir de longe', async () => {
    const room = await colyseus.createRoom<IslandRoom>(ROOM.island);
    const client = await colyseus.connectTo(room);
    const caixa = escutar(client);
    await room.waitForNextPatch();

    // O jogador nasce longe do Seu Bento e tenta falar com ele mesmo assim.
    client.send(MSG.interact, { alvo: 'spot_bento' });
    await respirar();
    expect(caixa.dialogos).toEqual([]);
    expect(caixa.missoes).toEqual([]);
  });

  it('alvo inventado e pacote torto não derrubam a sala', async () => {
    const room = await colyseus.createRoom<IslandRoom>(ROOM.island);
    const client = await colyseus.connectTo(room);
    await room.waitForNextPatch();

    client.send(MSG.interact, { alvo: 'spot_que_nao_existe' });
    client.send(MSG.interact, { nada: true });
    client.send(MSG.interact, 42);
    await respirar();

    expect(room.state.players.size).toBe(1);
  });

  it('o cliente pede a situação depois de escutar, e recebe', async () => {
    const room = await colyseus.createRoom<IslandRoom>(ROOM.island);
    const client = await colyseus.connectTo(room);
    const caixa = escutar(client);
    await room.waitForNextPatch();

    client.send(MSG.ready, {});
    await ate(() => caixa.inventarios.length > 0, 'a carteira inicial');
    expect(caixa.inventarios.at(-1)).toMatchObject({
      moedas: 0,
      joias: 0,
      coracoes: 3,
      coracoesMax: 3,
    });
    // Ainda sem missão aceita, então nada de objetivo.
    expect(caixa.missoes).toEqual([]);
    expect(ARENA_SPOTS.some((spot) => spot.alvo === 'npc_nara')).toBe(true);
  });

  it('quem volta para a sala recebe o objetivo em andamento', async () => {
    const room = await colyseus.createRoom<IslandRoom>(ROOM.island);
    const client = await colyseus.connectTo(room);
    const caixa = escutar(client);
    const seq = { n: 0 };
    await room.waitForNextPatch();

    await falar(room, client, caixa, 'spot_nara', seq);
    const antes = caixa.missoes.length;
    client.send(MSG.ready, {});
    await ate(() => caixa.missoes.length > antes, 'o objetivo reenviado');

    expect(caixa.missoes.at(-1)).toMatchObject({
      missao: 'm01',
      texto: 'Fale com o Seu Bento, na Vila Aconchego',
    });
  });

  it('cada jogador tem a própria missão (SPEC §4)', async () => {
    const room = await colyseus.createRoom<IslandRoom>(ROOM.island);
    const a = await colyseus.connectTo(room);
    const b = await colyseus.connectTo(room);
    const caixaA = escutar(a);
    const caixaB = escutar(b);
    const seqA = { n: 0 };
    await room.waitForNextPatch();

    await falar(room, a, caixaA, 'spot_nara', seqA);
    await respirar();
    expect(caixaA.missoes.at(-1)?.missao).toBe('m01');
    // B não recebeu nada: progresso é por jogador.
    expect(caixaB.missoes).toEqual([]);
    expect(caixaB.dialogos).toEqual([]);
  });
});
