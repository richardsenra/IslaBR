/**
 * Validação do `move` no servidor (SPEC §4: "o servidor valida velocidade e
 * posição — anti-teleporte simples").
 *
 * O cliente simula o próprio movimento e informa o resultado; o servidor não
 * refaz a simulação, só recusa o que é impossível. Dano, drops, moedas e
 * progresso continuam decididos só pelo servidor (M3 em diante).
 */

import { bodyBox, boxesOverlap, type Box } from './collision.js';
import {
  DODGE_SPEED,
  JUMP_SPEED,
  MAX_FALL_SPEED,
  PLAYER_DODGE_HEIGHT,
  PLAYER_RADIUS,
} from './movement.js';
import type { MovePayload } from './net.js';

/** Última posição aceita de um jogador. */
export interface AcceptedMove {
  readonly seq: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Instante (ms) em que foi aceita. */
  readonly atMs: number;
}

export type MoveRejection =
  'nao-finito' | 'sequencia' | 'velocidade' | 'deslocamento' | 'dentro-de-colisor';

export interface MoveCheck {
  readonly ok: boolean;
  readonly reason?: MoveRejection;
}

/** Folga para jitter de rede e lotes de pacotes. */
export const MOVE_GRACE_MS = 250;
/** Folga em metros, para erro de ponto flutuante e arredondamento. */
export const MOVE_TOLERANCE_M = 0.6;
/** Margem relativa aceita acima da velocidade máxima teórica. */
const SPEED_SLACK = 1.1;
/** Penetração aceita antes de considerar que o corpo está dentro de um colisor. */
const PENETRATION_TOLERANCE = 0.08;

const OK: MoveCheck = { ok: true };

function finite(...values: readonly number[]): boolean {
  return values.every((value) => Number.isFinite(value));
}

/** O corpo em pé encosta em quase tudo; a checagem usa a altura rolando. */
function insideCollider(x: number, y: number, z: number, boxes: readonly Box[]): boolean {
  const shrink = PENETRATION_TOLERANCE;
  const body = bodyBox(
    x,
    y + shrink,
    z,
    Math.max(PLAYER_RADIUS - shrink, 0.05),
    Math.max(PLAYER_DODGE_HEIGHT - shrink * 2, 0.1),
  );
  return boxes.some((box) => boxesOverlap(body, box));
}

export function checkMove(
  last: AcceptedMove,
  claim: MovePayload,
  nowMs: number,
  boxes: readonly Box[],
): MoveCheck {
  if (!finite(claim.seq, claim.x, claim.y, claim.z, claim.vx, claim.vy, claim.vz, claim.yaw)) {
    return { ok: false, reason: 'nao-finito' };
  }

  if (claim.seq <= last.seq) return { ok: false, reason: 'sequencia' };

  const horizontalSpeed = Math.hypot(claim.vx, claim.vz);
  if (horizontalSpeed > DODGE_SPEED * SPEED_SLACK) {
    return { ok: false, reason: 'velocidade' };
  }
  if (claim.vy > JUMP_SPEED * SPEED_SLACK || claim.vy < -MAX_FALL_SPEED * SPEED_SLACK) {
    return { ok: false, reason: 'velocidade' };
  }

  const window = (Math.max(nowMs - last.atMs, 0) + MOVE_GRACE_MS) / 1000;
  const horizontalDelta = Math.hypot(claim.x - last.x, claim.z - last.z);
  if (horizontalDelta > DODGE_SPEED * SPEED_SLACK * window + MOVE_TOLERANCE_M) {
    return { ok: false, reason: 'deslocamento' };
  }

  const verticalDelta = claim.y - last.y;
  const maxUp = JUMP_SPEED * SPEED_SLACK * window + MOVE_TOLERANCE_M;
  const maxDown = MAX_FALL_SPEED * SPEED_SLACK * window + MOVE_TOLERANCE_M;
  if (verticalDelta > maxUp || -verticalDelta > maxDown) {
    return { ok: false, reason: 'deslocamento' };
  }

  if (insideCollider(claim.x, claim.y, claim.z, boxes)) {
    return { ok: false, reason: 'dentro-de-colisor' };
  }

  return OK;
}
