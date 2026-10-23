/**
 * Regras de combate (SPEC §6).
 *
 * Tudo aqui é puro: o servidor é quem decide dano e morte (SPEC §4), e o
 * cliente usa as mesmas funções só para prever a animação e o feedback.
 *
 * Vida de inimigo é contada em golpes do Graveto Reforçado (1 por golpe) e
 * dano no jogador é contado em corações, de meio em meio (SPEC §5).
 */

import type { AttackState } from './character.js';

/** Segurar o ataque por este tempo vira golpe carregado (SPEC §6). */
export const CHARGE_SECONDS = 0.6;

/** Quanto tempo depois de um golpe ainda emenda o seguinte. */
export const COMBO_WINDOW_SECONDS = 0.7;

/** Duração de cada golpe, até poder atacar de novo. */
export const ATTACK_SECONDS = 0.35;
export const CHARGED_ATTACK_SECONDS = 0.6;

/** Congelamento na hora do acerto, em ms (SPEC §6). */
export const HIT_STOP_MS = 60;

/** Alcance do golpe, do centro do jogador para a frente. */
export const ATTACK_REACH = 1.6;
/** Raio da esfera de acerto. */
export const ATTACK_RADIUS = 0.9;

/** Dano do golpe carregado, em múltiplos do golpe normal (proposta). */
export const CHARGED_MULTIPLIER = 2;

export type AttackKind = AttackState;

/** Quanto cada arma tira por golpe (SPEC §6 e §7.7). */
export const WEAPON_DAMAGE: Readonly<Record<string, number>> = {
  graveto_reforcado: 1,
  arma_nv2: 2,
};

export function danoDaArma(arma: string | null): number {
  if (!arma) return 0;
  return WEAPON_DAMAGE[arma] ?? 0;
}

/** Dano de um golpe, já contando o carregado. */
export function danoDoGolpe(arma: string | null, golpe: AttackKind): number {
  const base = danoDaArma(arma);
  return golpe === 'charged' ? base * CHARGED_MULTIPLIER : base;
}

/**
 * Próximo golpe do combo de 3 (SPEC §6). Emendar dentro da janela avança;
 * esperar demais recomeça do primeiro.
 */
export function proximoGolpe(anterior: AttackKind | null, desdeOUltimo: number): AttackKind {
  if (!anterior || desdeOUltimo > COMBO_WINDOW_SECONDS) return 'attack1';
  if (anterior === 'attack1') return 'attack2';
  if (anterior === 'attack2') return 'attack3';
  // Depois do terceiro, o combo reinicia.
  return 'attack1';
}

export function duracaoDoGolpe(golpe: AttackKind): number {
  return golpe === 'charged' ? CHARGED_ATTACK_SECONDS : ATTACK_SECONDS;
}

/**
 * Fração da duração do golpe depois da qual já dá para atacar de novo. Menor
 * que 1 porque emendar o combo tem que ser possível antes de a animação acabar.
 * Cliente e servidor usam esta mesma conta: o cliente não manda golpe que o
 * servidor ia recusar, e o servidor não deixa passar golpe mais rápido.
 */
export const ATTACK_COOLDOWN_FACTOR = 0.8;

/** Quanto esperar, em ms, até o próximo golpe depois deste. */
export function recargaDoGolpeMs(golpe: AttackKind): number {
  return duracaoDoGolpe(golpe) * 1000 * ATTACK_COOLDOWN_FACTOR;
}

/**
 * Tempo mínimo, em ms, entre o golpe anterior e um carregado. O servidor não
 * enxerga o botão sendo segurado, só o golpe saindo; sem este piso, um cliente
 * adulterado mandaria "carregado" em rajada e bateria em dobro na cadência do
 * golpe normal. Com ele, o carregado nunca rende mais dano por segundo que o
 * normal.
 */
export const CHARGED_MIN_GAP_MS = CHARGE_SECONDS * 1000 * 0.8;

export interface Ponto {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Centro da esfera de acerto: à frente do jogador, na altura do peito.
 * As esferas presas aos ossos da SPEC §6 chegam com a arte; esta é a
 * aproximação que o servidor consegue validar sem simular o esqueleto.
 */
export function centroDoGolpe(origem: Ponto, yaw: number, alcance = ATTACK_REACH): Ponto {
  return {
    x: origem.x + Math.sin(yaw) * alcance,
    y: origem.y + 0.9,
    z: origem.z + Math.cos(yaw) * alcance,
  };
}

export function dentroDaEsfera(centro: Ponto, alvo: Ponto, raio: number): boolean {
  const dx = alvo.x - centro.x;
  const dy = alvo.y + 0.5 - centro.y;
  const dz = alvo.z - centro.z;
  return dx * dx + dy * dy + dz * dz <= raio * raio;
}

export interface AlvoDeGolpe extends Ponto {
  readonly id: string;
}

/** Quem o golpe pegou, do mais perto para o mais longe. */
export function alvosAtingidos(
  origem: Ponto,
  yaw: number,
  alvos: readonly AlvoDeGolpe[],
  alcance = ATTACK_REACH,
  raio = ATTACK_RADIUS,
): AlvoDeGolpe[] {
  const centro = centroDoGolpe(origem, yaw, alcance);
  return alvos
    .filter((alvo) => dentroDaEsfera(centro, alvo, raio))
    .sort(
      (a, b) =>
        (a.x - centro.x) ** 2 +
        (a.z - centro.z) ** 2 -
        ((b.x - centro.x) ** 2 + (b.z - centro.z) ** 2),
    );
}

/** O golpe veio de frente para o inimigo? Usado pelo caranguejo espinhoso. */
export function golpeDeFrente(
  atacante: Ponto,
  alvo: Ponto,
  yawDoAlvo: number,
  tolerancia = Math.PI / 2,
): boolean {
  const paraOAtacante = Math.atan2(atacante.x - alvo.x, atacante.z - alvo.z);
  const diferenca = Math.abs(
    Math.atan2(Math.sin(paraOAtacante - yawDoAlvo), Math.cos(paraOAtacante - yawDoAlvo)),
  );
  return diferenca <= tolerancia;
}

export interface ResultadoDoGolpe {
  /** Dano aplicado no inimigo. */
  readonly dano: number;
  /** Dano que voltou no jogador, em corações (caranguejo espinhoso). */
  readonly refletido: number;
}

/**
 * Dano de um golpe num inimigo. O espinhoso (e02) devolve o golpe de frente;
 * pelas costas, leva normal (SPEC §7.6).
 */
export function resolverGolpe(opcoes: {
  readonly arma: string | null;
  readonly golpe: AttackKind;
  readonly refleteDeFrente: boolean;
  readonly deFrente: boolean;
  readonly danoDoInimigo: number;
}): ResultadoDoGolpe {
  if (opcoes.refleteDeFrente && opcoes.deFrente) {
    return { dano: 0, refletido: opcoes.danoDoInimigo };
  }
  return { dano: danoDoGolpe(opcoes.arma, opcoes.golpe), refletido: 0 };
}

/**
 * Dano que chega no jogador, em corações. A esquiva dá invulnerabilidade curta
 * e a armadura apara meio coração (SPEC §6 e §7.7).
 */
export function danoNoJogador(opcoes: {
  readonly dano: number;
  readonly invulneravel: boolean;
  readonly reducao: number;
}): number {
  if (opcoes.invulneravel) return 0;
  const depoisDaArmadura = opcoes.dano - opcoes.reducao;
  // Nunca cura, e nunca passa de meio coração de granularidade.
  return Math.max(0, Math.round(depoisDaArmadura * 2) / 2);
}

export function aplicarDano(vidaAtual: number, dano: number): number {
  return Math.max(0, vidaAtual - dano);
}
