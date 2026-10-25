/** Máquina de estados do personagem (SPEC §6). */

export const CHARACTER_STATES = [
  'idle',
  'run',
  'jump',
  'fall',
  'attack1',
  'attack2',
  'attack3',
  'charged',
  'plunge',
  'dodge',
  'hurt',
  'dead',
] as const;

export type CharacterState = (typeof CHARACTER_STATES)[number];

/** Estados de ataque, implementados no M3. */
export type AttackState = 'attack1' | 'attack2' | 'attack3' | 'charged' | 'plunge';

/** Transições de 0,1–0,2 s (SPEC §6): o cliente mistura as poses neste tempo. */
export const STATE_BLEND_SECONDS = 0.15;

/** Abaixo desta velocidade horizontal (m/s) o personagem está parado. */
export const RUN_SPEED_THRESHOLD = 0.1;

export interface CharacterContext {
  readonly dead: boolean;
  readonly hurt: boolean;
  /** Golpe em andamento; sempre `null` até o M3. */
  readonly attack: AttackState | null;
  readonly dodging: boolean;
  readonly onGround: boolean;
  readonly vy: number;
  readonly speed: number;
}

/** Estado seguinte, em ordem de prioridade. */
export function nextCharacterState(ctx: CharacterContext): CharacterState {
  if (ctx.dead) return 'dead';
  if (ctx.hurt) return 'hurt';
  if (ctx.dodging) return 'dodge';
  if (ctx.attack !== null) return ctx.attack;
  if (!ctx.onGround) return ctx.vy > 0 ? 'jump' : 'fall';
  return ctx.speed > RUN_SPEED_THRESHOLD ? 'run' : 'idle';
}

export function isCharacterState(value: string): value is CharacterState {
  return (CHARACTER_STATES as readonly string[]).includes(value);
}
