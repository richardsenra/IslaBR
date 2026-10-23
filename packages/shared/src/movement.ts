/**
 * Regras puras de movimento (SPEC §6).
 *
 * O mesmo passo roda no cliente (predição a 60 Hz) e no servidor (validação),
 * por isso vive aqui e não em nenhum dos dois. A SPEC propõe Rapier no cliente;
 * um controlador cinemático próprio foi preferido porque predição e
 * reconciliação exigem que servidor e cliente simulem exatamente a mesma coisa,
 * e porque não há corpos dinâmicos nesta fase. Trocar significa reescrever só
 * este arquivo e `collision.ts`.
 */

import { bodyBox, overlapsAny, sweepAxis, type Box } from './collision.js';
import { nextCharacterState, type CharacterState } from './character.js';

/** Raio do corpo em metros. */
export const PLAYER_RADIUS = 0.4;
/** Altura em pé. */
export const PLAYER_HEIGHT = 1.7;
/** Altura rolando: é o que deixa a esquiva passar por vãos baixos (SPEC §6). */
export const PLAYER_DODGE_HEIGHT = 0.9;

export const MOVE_SPEED = 5.5;
export const GRAVITY = 18;
/** Dá cerca de 1,36 m de altura, o bastante para subir nas caixas. */
export const JUMP_SPEED = 7;
export const MAX_FALL_SPEED = 25;

export const DODGE_SPEED = 11;
export const DODGE_DURATION = 0.35;
/** Recarga de 1,2 s (SPEC §6). */
export const DODGE_COOLDOWN = 1.2;
/** Invulnerabilidade curta de 0,25 s (SPEC §6). */
export const DODGE_INVULN = 0.25;

/** Velocidade de giro do personagem em rad/s. */
export const TURN_SPEED = 14;

/** Passo máximo de simulação; acima disso o quadro é fatiado. */
export const MAX_STEP_SECONDS = 0.1;
/** Deslocamento máximo por subpasso, para não atravessar paredes. */
const MAX_SUBSTEP_DISTANCE = 0.25;
/** Enquanto não houver espaço para levantar, a esquiva continua. */
const STAND_UP_RETRY = 0.05;
const INPUT_DEADZONE = 0.01;

export interface PlayerPhysics {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
  readonly yaw: number;
  readonly onGround: boolean;
  /** Tempo restante de esquiva. */
  readonly dodgeTime: number;
  readonly dodgeCooldown: number;
  readonly invulnTime: number;
  readonly dodgeDirX: number;
  readonly dodgeDirZ: number;
  readonly state: CharacterState;
  /** Tempo no estado atual, para as animações. */
  readonly stateTime: number;
}

/** Um comando de entrada. `moveX`/`moveZ` já vêm em coordenadas do mundo. */
export interface MoveInput {
  readonly seq: number;
  readonly dt: number;
  readonly moveX: number;
  readonly moveZ: number;
  readonly jump: boolean;
  readonly dodge: boolean;
  /**
   * Fração da velocidade de corrida, de 0 a 1. Menor que 1 quando o jogador está
   * lento (gosma do sapo). Só afeta o andar: a esquiva não é freada, e o servidor
   * não precisa conferir porque só reduz a velocidade que ele já aceita.
   */
  readonly speedScale?: number;
}

export function spawnPhysics(x = 0, y = 0, z = 0, yaw = 0): PlayerPhysics {
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw,
    onGround: false,
    dodgeTime: 0,
    dodgeCooldown: 0,
    invulnTime: 0,
    dodgeDirX: 0,
    dodgeDirZ: 1,
    state: 'fall',
    stateTime: 0,
  };
}

/** Ângulo em [-π, π). */
export function wrapAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  const wrapped = (((angle + Math.PI) % twoPi) + twoPi) % twoPi;
  return wrapped - Math.PI;
}

/** Gira de `from` para `to` no caminho curto, no máximo `maxDelta`. */
export function turnToward(from: number, to: number, maxDelta: number): number {
  const delta = wrapAngle(to - from);
  if (Math.abs(delta) <= maxDelta) return wrapAngle(to);
  return wrapAngle(from + Math.sign(delta) * maxDelta);
}

/** Interpola ângulos pelo caminho curto (usado na interpolação remota). */
export function lerpAngle(from: number, to: number, t: number): number {
  return wrapAngle(from + wrapAngle(to - from) * t);
}

export function bodyHeightFor(physics: Pick<PlayerPhysics, 'dodgeTime'>): number {
  return physics.dodgeTime > 0 ? PLAYER_DODGE_HEIGHT : PLAYER_HEIGHT;
}

export function playerBox(physics: Pick<PlayerPhysics, 'x' | 'y' | 'z' | 'dodgeTime'>): Box {
  return bodyBox(physics.x, physics.y, physics.z, PLAYER_RADIUS, bodyHeightFor(physics));
}

/** Um passo de simulação. Puro: devolve um estado novo. */
export function stepPlayer(
  prev: PlayerPhysics,
  input: MoveInput,
  boxes: readonly Box[],
): PlayerPhysics {
  const dt = Math.min(Math.max(input.dt, 0), MAX_STEP_SECONDS);
  if (dt <= 0) return prev;

  const dead = prev.state === 'dead';
  let dodgeTime = Math.max(0, prev.dodgeTime - dt);
  let dodgeCooldown = Math.max(0, prev.dodgeCooldown - dt);
  let invulnTime = Math.max(0, prev.invulnTime - dt);
  let dodgeDirX = prev.dodgeDirX;
  let dodgeDirZ = prev.dodgeDirZ;
  let yaw = prev.yaw;

  // Direção desejada: magnitude analógica até 1.
  let dirX = input.moveX;
  let dirZ = input.moveZ;
  const inputLength = Math.hypot(dirX, dirZ);
  if (inputLength > 1) {
    dirX /= inputLength;
    dirZ /= inputLength;
  }
  const moving = inputLength > INPUT_DEADZONE;

  if (!dead && input.dodge && dodgeTime === 0 && dodgeCooldown === 0 && prev.onGround) {
    if (moving) {
      dodgeDirX = dirX / Math.min(inputLength, 1);
      dodgeDirZ = dirZ / Math.min(inputLength, 1);
    } else {
      dodgeDirX = Math.sin(yaw);
      dodgeDirZ = Math.cos(yaw);
    }
    dodgeTime = DODGE_DURATION;
    dodgeCooldown = DODGE_COOLDOWN;
    invulnTime = DODGE_INVULN;
  }

  const dodging = dodgeTime > 0;

  // Giro: rolando, o personagem encara a direção da esquiva.
  if (dodging) {
    yaw = Math.atan2(dodgeDirX, dodgeDirZ);
  } else if (moving && !dead) {
    yaw = turnToward(yaw, Math.atan2(dirX, dirZ), TURN_SPEED * dt);
  }

  let vx: number;
  let vz: number;
  if (dodging) {
    vx = dodgeDirX * DODGE_SPEED;
    vz = dodgeDirZ * DODGE_SPEED;
  } else if (dead) {
    vx = 0;
    vz = 0;
  } else {
    const escala = Math.min(Math.max(input.speedScale ?? 1, 0), 1);
    vx = dirX * MOVE_SPEED * escala;
    vz = dirZ * MOVE_SPEED * escala;
  }

  let { x, y, z } = prev;
  let vy = prev.vy;

  if (!dead && input.jump && prev.onGround && !dodging) {
    vy = JUMP_SPEED;
  }

  vy = Math.max(vy - GRAVITY * dt, -MAX_FALL_SPEED);

  const height = dodging ? PLAYER_DODGE_HEIGHT : PLAYER_HEIGHT;
  const longestAxis = Math.max(Math.abs(vx), Math.abs(vy), Math.abs(vz)) * dt;
  const substeps = Math.max(1, Math.ceil(longestAxis / MAX_SUBSTEP_DISTANCE));
  const sdt = dt / substeps;
  let grounded = false;

  for (let i = 0; i < substeps; i += 1) {
    const body = bodyBox(x, y, z, PLAYER_RADIUS, height);

    const wantedY = vy * sdt;
    const movedY = sweepAxis(body, 'y', wantedY, boxes);
    y += movedY;
    if (movedY !== wantedY) {
      if (vy < 0) grounded = true;
      vy = 0;
    }

    const shifted = bodyBox(x, y, z, PLAYER_RADIUS, height);
    const wantedX = vx * sdt;
    const movedX = sweepAxis(shifted, 'x', wantedX, boxes);
    x += movedX;
    if (movedX !== wantedX) vx = 0;

    const shiftedAgain = bodyBox(x, y, z, PLAYER_RADIUS, height);
    const wantedZ = vz * sdt;
    const movedZ = sweepAxis(shiftedAgain, 'z', wantedZ, boxes);
    z += movedZ;
    if (movedZ !== wantedZ) vz = 0;
  }

  const onGround = grounded;

  // Terminou a esquiva debaixo de um vão baixo: continua rolando até caber em pé.
  if (dodgeTime === 0 && prev.dodgeTime > 0) {
    if (overlapsAny(bodyBox(x, y, z, PLAYER_RADIUS, PLAYER_HEIGHT), boxes)) {
      dodgeTime = STAND_UP_RETRY;
    }
  }

  const state = nextCharacterState({
    dead,
    hurt: false,
    attack: null,
    dodging: dodgeTime > 0,
    onGround,
    vy,
    speed: Math.hypot(vx, vz),
  });

  return {
    x,
    y,
    z,
    vx,
    vy,
    vz,
    yaw,
    onGround,
    dodgeTime,
    dodgeCooldown,
    invulnTime,
    dodgeDirX,
    dodgeDirZ,
    state,
    stateTime: state === prev.state ? prev.stateTime + dt : 0,
  };
}

/**
 * Converte os eixos do controle (frente/lado, relativos à câmera) na direção
 * em coordenadas do mundo que o `stepPlayer` espera. Mesma convenção de yaw:
 * frente é (sen yaw, cos yaw), e a direita é frente × cima, ou seja -X em
 * yaw 0.
 */
export function moveDirectionFromCamera(
  forward: number,
  strafe: number,
  cameraYaw: number,
): { readonly x: number; readonly z: number } {
  const forwardX = Math.sin(cameraYaw);
  const forwardZ = Math.cos(cameraYaw);
  return {
    x: forward * forwardX + strafe * -forwardZ,
    z: forward * forwardZ + strafe * forwardX,
  };
}
