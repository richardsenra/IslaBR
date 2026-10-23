import type { Room as SDKRoom } from '@colyseus/sdk';
import {
  MSG,
  spotById,
  type DialoguePayload,
  type InventoryUpdatePayload,
  type LootPayload,
  type MoveCorrectionPayload,
  type MovePayload,
  type QuestUpdatePayload,
} from '@islabr/shared';
import type { IslandRoom } from './IslandRoom.js';

/**
 * Peças comuns dos testes de sala: andar até um alvo, apertar F e esperar o
 * que o servidor responde. Não é arquivo de teste; é a ferramenta deles.
 */

export interface Caixa {
  readonly dialogos: DialoguePayload[];
  readonly missoes: QuestUpdatePayload[];
  readonly loots: LootPayload[];
  readonly inventarios: InventoryUpdatePayload[];
  readonly correcoes: MoveCorrectionPayload[];
}

export function escutar(client: SDKRoom): Caixa {
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
export async function ate(condicao: () => boolean, oQue: string, limiteMs = 3000): Promise<void> {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    if (condicao()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`tempo esgotado esperando: ${oQue}`);
}

/** Um descanso curto para o caso em que nada deve acontecer. */
export async function respirar(ms = 150): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export interface Sequencia {
  n: number;
}

/**
 * Leva o jogador até o alvo e aperta F. Anda em passos curtos porque o
 * anti-teleporte do servidor recusa salto grande — como deve mesmo.
 */
export async function irAte(
  room: IslandRoom,
  client: SDKRoom,
  spotId: string,
  seq: Sequencia,
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
    seq.n += 1;
    const move: MovePayload = {
      seq: seq.n,
      x: atual.x + (dx / falta) * avanco,
      y: spot.y,
      z: atual.z + (dz / falta) * avanco,
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
export async function falar(
  room: IslandRoom,
  client: SDKRoom,
  caixa: Caixa,
  spotId: string,
  seq: Sequencia,
): Promise<DialoguePayload> {
  const antes = caixa.dialogos.length;
  await irAte(room, client, spotId, seq);
  await ate(() => caixa.dialogos.length > antes, `uma fala ao interagir com ${spotId}`);
  const fala = caixa.dialogos.at(-1);
  if (!fala) throw new Error('fala sumiu');
  return fala;
}

/** Joga a m01 inteira: aceita com a Nara, visita os dois e volta. */
export async function completarM01(
  room: IslandRoom,
  client: SDKRoom,
  caixa: Caixa,
  seq: Sequencia,
): Promise<void> {
  await falar(room, client, caixa, 'spot_nara', seq);
  await falar(room, client, caixa, 'spot_bento', seq);
  await falar(room, client, caixa, 'spot_iracema', seq);
  await falar(room, client, caixa, 'spot_nara', seq);
}
