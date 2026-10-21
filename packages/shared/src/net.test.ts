import { describe, expect, it } from 'vitest';
import { ISLAND_MAX_PLAYERS, SERVER_TICK_MS } from './net.js';

describe('constantes de rede', () => {
  it('tick de 20 Hz equivale a 50 ms', () => {
    expect(SERVER_TICK_MS).toBe(50);
  });

  it('ilha comporta até 8 jogadores', () => {
    expect(ISLAND_MAX_PLAYERS).toBe(8);
  });
});
