import { describe, expect, it } from 'vitest';
import {
  INTERP_DELAY_MS,
  ISLAND_MAX_PLAYERS,
  MOVE_SEND_MS,
  SERVER_TICK_MS,
  parseMovePayload,
} from './net.js';

describe('constantes de rede', () => {
  it('tick de 20 Hz equivale a 50 ms', () => {
    expect(SERVER_TICK_MS).toBe(50);
  });

  it('ilha comporta até 8 jogadores', () => {
    expect(ISLAND_MAX_PLAYERS).toBe(8);
  });

  it('o atraso de interpolação cobre mais de um pacote de estado', () => {
    expect(INTERP_DELAY_MS).toBeGreaterThan(MOVE_SEND_MS);
  });
});

describe('parseMovePayload', () => {
  const valid = {
    seq: 7,
    x: 1,
    y: 0,
    z: 2,
    vx: 0,
    vy: 0,
    vz: 5.5,
    yaw: 0.3,
    state: 'run',
  };

  it('aceita um pacote completo', () => {
    expect(parseMovePayload(valid)).toEqual(valid);
  });

  it('descarta o que não é objeto', () => {
    expect(parseMovePayload(null)).toBeNull();
    expect(parseMovePayload('move')).toBeNull();
    expect(parseMovePayload(42)).toBeNull();
  });

  it('descarta campo faltando ou de tipo errado', () => {
    expect(parseMovePayload({ ...valid, x: '1' })).toBeNull();
    const withoutYaw: Record<string, unknown> = { ...valid };
    delete withoutYaw['yaw'];
    expect(parseMovePayload(withoutYaw)).toBeNull();
  });

  it('descarta estado desconhecido', () => {
    expect(parseMovePayload({ ...valid, state: 'voando' })).toBeNull();
  });

  it('ignora campos extras', () => {
    expect(parseMovePayload({ ...valid, extra: true })).toEqual(valid);
  });
});
