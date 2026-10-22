import { describe, expect, it } from 'vitest';
import { ARENA_COLLIDERS } from './arena.js';
import { DODGE_SPEED, MOVE_SPEED } from './movement.js';
import type { MovePayload } from './net.js';
import { checkMove, type AcceptedMove } from './validation.js';

const last: AcceptedMove = { seq: 10, x: 0, y: 0, z: 8, atMs: 1000 };

function claim(partial: Partial<MovePayload> = {}): MovePayload {
  return {
    seq: 11,
    x: 0,
    y: 0,
    z: 8,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    state: 'idle',
    ...partial,
  };
}

/** 50 ms depois, o tempo de um tick do servidor. */
const now = 1050;

describe('checkMove', () => {
  it('aceita um passo normal de corrida', () => {
    const moved = claim({ z: 8 + MOVE_SPEED * 0.05, vz: MOVE_SPEED });
    expect(checkMove(last, moved, now, ARENA_COLLIDERS)).toEqual({ ok: true });
  });

  it('aceita uma esquiva inteira', () => {
    const moved = claim({ z: 8 + DODGE_SPEED * 0.05, vz: DODGE_SPEED });
    expect(checkMove(last, moved, now, ARENA_COLLIDERS).ok).toBe(true);
  });

  it('recusa teleporte', () => {
    const check = checkMove(last, claim({ x: 60 }), now, ARENA_COLLIDERS);
    expect(check).toEqual({ ok: false, reason: 'deslocamento' });
  });

  it('recusa velocidade acima do máximo', () => {
    const check = checkMove(last, claim({ vz: DODGE_SPEED * 3 }), now, ARENA_COLLIDERS);
    expect(check).toEqual({ ok: false, reason: 'velocidade' });
  });

  it('recusa subir voando', () => {
    const check = checkMove(last, claim({ vy: 40 }), now, ARENA_COLLIDERS);
    expect(check).toEqual({ ok: false, reason: 'velocidade' });
  });

  it('recusa sequência repetida ou fora de ordem', () => {
    expect(checkMove(last, claim({ seq: 10 }), now, ARENA_COLLIDERS).reason).toBe('sequencia');
    expect(checkMove(last, claim({ seq: 3 }), now, ARENA_COLLIDERS).reason).toBe('sequencia');
  });

  it('recusa números inválidos', () => {
    expect(checkMove(last, claim({ x: Number.NaN }), now, ARENA_COLLIDERS).reason).toBe(
      'nao-finito',
    );
    expect(
      checkMove(last, claim({ vy: Number.POSITIVE_INFINITY }), now, ARENA_COLLIDERS).reason,
    ).toBe('nao-finito');
  });

  it('recusa posição dentro de um colisor', () => {
    // Dentro do paredão (centro 0, 2, -12).
    const inside: AcceptedMove = { seq: 10, x: 0, y: 0, z: -11.4, atMs: 1000 };
    const check = checkMove(inside, claim({ x: 0, y: 1, z: -12 }), now, ARENA_COLLIDERS);
    expect(check).toEqual({ ok: false, reason: 'dentro-de-colisor' });
  });

  it('aceita andar rolando por baixo da laje do vão', () => {
    const atPassage: AcceptedMove = { seq: 10, x: -8, y: 0, z: 0, atMs: 1000 };
    const check = checkMove(
      atPassage,
      claim({ x: -8 + DODGE_SPEED * 0.05, y: 0, z: 0, vx: DODGE_SPEED, state: 'dodge' }),
      now,
      ARENA_COLLIDERS,
    );
    expect(check.ok).toBe(true);
  });

  it('dá folga para jitter: um pacote atrasado ainda passa', () => {
    // Mesmo com o relógio parado, a folga cobre um pacote de 250 ms.
    const moved = claim({ z: 8 + MOVE_SPEED * 0.2, vz: MOVE_SPEED });
    expect(checkMove(last, moved, 1000, ARENA_COLLIDERS).ok).toBe(true);
  });

  it('a folga não cobre um salto grande', () => {
    const moved = claim({ z: 8 + 20, vz: MOVE_SPEED });
    expect(checkMove(last, moved, 1000, ARENA_COLLIDERS).ok).toBe(false);
  });
});
