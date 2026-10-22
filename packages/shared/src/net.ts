import { isCharacterState, type CharacterState } from './character.js';

/** Nomes das salas do Colyseus (SPEC §4). */
export const ROOM = {
  island: 'island',
  home: 'home',
} as const;

export type RoomName = (typeof ROOM)[keyof typeof ROOM];

/** Jogadores por instância da ilha (proposta: 8). */
export const ISLAND_MAX_PLAYERS = 8;

/** Tick do servidor em Hz. */
export const SERVER_TICK_HZ = 20;

export const SERVER_TICK_MS = 1000 / SERVER_TICK_HZ;

export const DEFAULT_SERVER_PORT = 2567;

/** Passo fixo da simulação no cliente. */
export const CLIENT_STEP_HZ = 60;

export const CLIENT_STEP_MS = 1000 / CLIENT_STEP_HZ;

/** Frequência de envio de `move` ao servidor. */
export const MOVE_SEND_HZ = 20;

export const MOVE_SEND_MS = 1000 / MOVE_SEND_HZ;

/**
 * Atraso de renderização dos jogadores remotos. Vale um pacote de estado a
 * 10–20 Hz mais folga de jitter, e é o que mantém a interpolação sem saltos no
 * critério de aceite do M1 (100 ms de latência simulada).
 */
export const INTERP_DELAY_MS = 100;

/** Mensagens da SPEC §4. Nesta fase só `move` e `move_correction` rodam. */
export const MSG = {
  move: 'move',
  attack: 'attack',
  dodge: 'dodge',
  interact: 'interact',
  dialogueChoice: 'dialogue_choice',
  useItem: 'use_item',
  buy: 'buy',
  craft: 'craft',
  chat: 'chat',
  /** S→C: o servidor recusou a posição informada e manda a última válida. */
  moveCorrection: 'move_correction',
  damage: 'damage',
  questUpdate: 'quest_update',
  inventoryUpdate: 'inventory_update',
  loot: 'loot',
} as const;

/** C→S: posição, velocidade, yaw e número de sequência (SPEC §4). */
export interface MovePayload {
  readonly seq: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
  readonly yaw: number;
  readonly state: CharacterState;
}

/** S→C: volta para a última posição aceita; o cliente reaplica os comandos. */
export interface MoveCorrectionPayload {
  readonly seq: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly reason: string;
}

/**
 * Guarda de tipo para o `move` que chega do cliente. O servidor não confia em
 * nada que venha de fora; o que não casar com o formato é descartado.
 * (`packages/content` valida conteúdo com zod; aqui a checagem é manual para
 * `shared` não carregar dependência.)
 */
export function parseMovePayload(raw: unknown): MovePayload | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as Record<string, unknown>;
  const numbers = ['seq', 'x', 'y', 'z', 'vx', 'vy', 'vz', 'yaw'] as const;
  for (const key of numbers) {
    if (typeof data[key] !== 'number') return null;
  }
  const state = data['state'];
  if (typeof state !== 'string' || !isCharacterState(state)) return null;
  return {
    seq: data['seq'] as number,
    x: data['x'] as number,
    y: data['y'] as number,
    z: data['z'] as number,
    vx: data['vx'] as number,
    vy: data['vy'] as number,
    vz: data['vz'] as number,
    yaw: data['yaw'] as number,
    state,
  };
}
