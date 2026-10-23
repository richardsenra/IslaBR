import { getEnemy, type Enemy } from '@islabr/content';
import { ENEMY_ATTACK_COOLDOWN, wrapAngle } from '@islabr/shared';

/**
 * IA dos inimigos comuns (SPEC §9, M3). Roda no tick de 20 Hz do servidor.
 *
 * É propositalmente simples: parado até ver alguém, persegue, bate quando
 * alcança e volta para o posto quando o jogador some. Os comportamentos
 * próprios da seção 7.6 (caranguejo que anda de lado, mosquito que mergulha)
 * entram na aparência, no cliente; aqui o que importa é quem toma dano.
 */

/** Distância em que o bicho percebe o jogador. */
export const AGGRO_RADIUS = 7;
/** Distância em que desiste e volta para o posto. */
export const DESIST_RADIUS = 12;
/** Distância em que consegue bater. */
export const ATTACK_RANGE = 1.5;
/** Velocidade de perseguição, em m/s. */
export const CHASE_SPEED = 2.6;
/** Tempo parado depois de levar um golpe. */
export const FLINCH_SECONDS = 0.25;

export type EnemyMode = 'parado' | 'perseguindo' | 'atacando' | 'ferido' | 'morto';

export interface EnemyRuntime {
  readonly id: string;
  readonly tipo: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  estado: EnemyMode;
  /** Onde ele fica quando não tem ninguém por perto. */
  readonly postoX: number;
  readonly postoZ: number;
  /** Tempo até poder atacar de novo. */
  recarga: number;
  /** Tempo restante de tontura depois de apanhar. */
  atordoado: number;
  /** Quem ele está perseguindo. */
  alvo: string | null;
}

export interface AlvoDoInimigo {
  readonly sessionId: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Jogador morto ou invulnerável não vira alvo. */
  readonly atacavel: boolean;
}

export interface Mordida {
  readonly inimigo: string;
  readonly alvo: string;
  readonly dano: number;
}

export function criarInimigo(
  id: string,
  tipo: string,
  x: number,
  z: number,
  yaw = 0,
): EnemyRuntime {
  const def = getEnemy(tipo);
  return {
    id,
    tipo,
    x,
    y: 0,
    z,
    yaw,
    hp: def.hp,
    estado: 'parado',
    postoX: x,
    postoZ: z,
    recarga: 0,
    atordoado: 0,
    alvo: null,
  };
}

function distancia(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Vira na direção do ponto, sem girar mais que `maxGiro` no passo. */
function virarPara(inimigo: EnemyRuntime, alvo: { x: number; z: number }, maxGiro: number): void {
  const desejado = Math.atan2(alvo.x - inimigo.x, alvo.z - inimigo.z);
  const diferenca = wrapAngle(desejado - inimigo.yaw);
  inimigo.yaw = wrapAngle(
    inimigo.yaw + Math.sign(diferenca) * Math.min(Math.abs(diferenca), maxGiro),
  );
}

function andarPara(
  inimigo: EnemyRuntime,
  alvo: { x: number; z: number },
  velocidade: number,
  dt: number,
): void {
  const dx = alvo.x - inimigo.x;
  const dz = alvo.z - inimigo.z;
  const falta = Math.hypot(dx, dz);
  if (falta < 0.05) return;
  const passo = Math.min(velocidade * dt, falta);
  inimigo.x += (dx / falta) * passo;
  inimigo.z += (dz / falta) * passo;
}

/**
 * Um passo da IA de um inimigo. Devolve a mordida, se ele conseguiu bater.
 * Puro o bastante para o teste: só mexe no próprio inimigo.
 */
export function passoDaIA(
  inimigo: EnemyRuntime,
  jogadores: readonly AlvoDoInimigo[],
  dt: number,
): Mordida | null {
  if (inimigo.estado === 'morto') return null;

  inimigo.recarga = Math.max(0, inimigo.recarga - dt);
  inimigo.atordoado = Math.max(0, inimigo.atordoado - dt);

  if (inimigo.atordoado > 0) {
    inimigo.estado = 'ferido';
    return null;
  }

  const alcancaveis = jogadores.filter((jogador) => jogador.atacavel);
  const maisPerto = alcancaveis.reduce<AlvoDoInimigo | null>((melhor, jogador) => {
    if (!melhor) return jogador;
    return distancia(inimigo, jogador) < distancia(inimigo, melhor) ? jogador : melhor;
  }, null);

  if (!maisPerto || distancia(inimigo, maisPerto) > DESIST_RADIUS) {
    // Sem ninguém por perto: volta para o posto e espera.
    inimigo.alvo = null;
    inimigo.estado = 'parado';
    andarPara(inimigo, { x: inimigo.postoX, z: inimigo.postoZ }, CHASE_SPEED * 0.6, dt);
    return null;
  }

  const perto = distancia(inimigo, maisPerto);
  if (perto > AGGRO_RADIUS && inimigo.alvo === null) {
    inimigo.estado = 'parado';
    return null;
  }

  inimigo.alvo = maisPerto.sessionId;
  virarPara(inimigo, maisPerto, 6 * dt);

  if (perto > ATTACK_RANGE) {
    inimigo.estado = 'perseguindo';
    andarPara(inimigo, maisPerto, CHASE_SPEED, dt);
    return null;
  }

  inimigo.estado = 'atacando';
  if (inimigo.recarga > 0) return null;

  inimigo.recarga = ENEMY_ATTACK_COOLDOWN;
  const def: Enemy = getEnemy(inimigo.tipo);
  return { inimigo: inimigo.id, alvo: maisPerto.sessionId, dano: def.dano };
}

/** Marca o inimigo como ferido e devolve se ele morreu com este golpe. */
export function levarGolpe(inimigo: EnemyRuntime, dano: number): boolean {
  inimigo.hp = Math.max(0, inimigo.hp - dano);
  if (inimigo.hp === 0) {
    inimigo.estado = 'morto';
    return true;
  }
  if (dano > 0) inimigo.atordoado = FLINCH_SECONDS;
  return false;
}
