/**
 * Arena de testes do M1.
 *
 * Não é conteúdo de jogo: é um ginásio provisório para exercitar movimento,
 * pulo, esquiva e colisão de câmera. O greybox das zonas z1–z5 chega no M4 e
 * virá de `packages/content` (`zones.json`), não daqui. Fica em `shared`
 * porque o servidor valida posições contra os mesmos colisores que o cliente
 * desenha.
 */

import { boxFromCenter, type Box } from './collision.js';

export type ArenaPieceKind = 'ground' | 'wall' | 'crate' | 'platform' | 'ceiling';

export interface ArenaPiece {
  readonly id: string;
  readonly kind: ArenaPieceKind;
  /** Centro da caixa. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
  readonly color: string;
}

export const ARENA_SPAWN = { x: 0, y: 0, z: 8, yaw: Math.PI } as const;

export const ARENA_PIECES: readonly ArenaPiece[] = [
  // Chão: topo em y = 0.
  {
    id: 'chao',
    kind: 'ground',
    x: 0,
    y: -0.5,
    z: 0,
    sizeX: 48,
    sizeY: 1,
    sizeZ: 48,
    color: '#7ccf5a',
  },

  // Muros da borda.
  {
    id: 'muro_n',
    kind: 'wall',
    x: 0,
    y: 2,
    z: -24,
    sizeX: 48,
    sizeY: 4,
    sizeZ: 1,
    color: '#6ea8d8',
  },
  {
    id: 'muro_s',
    kind: 'wall',
    x: 0,
    y: 2,
    z: 24,
    sizeX: 48,
    sizeY: 4,
    sizeZ: 1,
    color: '#6ea8d8',
  },
  {
    id: 'muro_l',
    kind: 'wall',
    x: 24,
    y: 2,
    z: 0,
    sizeX: 1,
    sizeY: 4,
    sizeZ: 48,
    color: '#6ea8d8',
  },
  {
    id: 'muro_o',
    kind: 'wall',
    x: -24,
    y: 2,
    z: 0,
    sizeX: 1,
    sizeY: 4,
    sizeZ: 48,
    color: '#6ea8d8',
  },

  // Escada de caixas: cada degrau sobe 1,2 m, dentro do alcance do pulo.
  {
    id: 'caixa_1',
    kind: 'crate',
    x: 6,
    y: 0.6,
    z: -2,
    sizeX: 1.6,
    sizeY: 1.2,
    sizeZ: 1.6,
    color: '#d98b45',
  },
  {
    id: 'caixa_2',
    kind: 'crate',
    x: 7.8,
    y: 1.2,
    z: -2,
    sizeX: 1.6,
    sizeY: 2.4,
    sizeZ: 1.6,
    color: '#c97a36',
  },
  {
    id: 'caixa_3',
    kind: 'crate',
    x: 9.6,
    y: 1.8,
    z: -2,
    sizeX: 1.6,
    sizeY: 3.6,
    sizeZ: 1.6,
    color: '#b96b2c',
  },

  // Plataformas: a primeira continua a escada, a segunda exige um pulo.
  {
    id: 'plataforma_1',
    kind: 'platform',
    x: 12.2,
    y: 3.7,
    z: -2,
    sizeX: 3,
    sizeY: 0.4,
    sizeZ: 3,
    color: '#9b7bd4',
  },
  {
    id: 'plataforma_2',
    kind: 'platform',
    x: 12.2,
    y: 3.7,
    z: 3,
    sizeX: 3,
    sizeY: 0.4,
    sizeZ: 3,
    color: '#8a68c9',
  },

  // Vão baixo: 1 m de altura. Passa rolando (0,9 m), não passa em pé (1,7 m).
  {
    id: 'vao_laje',
    kind: 'ceiling',
    x: -8,
    y: 1.6,
    z: 0,
    sizeX: 4,
    sizeY: 1.2,
    sizeZ: 4,
    color: '#e86aa6',
  },
  {
    id: 'vao_lado_n',
    kind: 'wall',
    x: -8,
    y: 1.5,
    z: -4,
    sizeX: 4,
    sizeY: 3,
    sizeZ: 4,
    color: '#d4588f',
  },
  {
    id: 'vao_lado_s',
    kind: 'wall',
    x: -8,
    y: 1.5,
    z: 4,
    sizeX: 4,
    sizeY: 3,
    sizeZ: 4,
    color: '#d4588f',
  },

  // Paredão para testar a colisão da câmera.
  {
    id: 'paredao',
    kind: 'wall',
    x: 0,
    y: 2,
    z: -12,
    sizeX: 14,
    sizeY: 4,
    sizeZ: 1,
    color: '#6ea8d8',
  },
];

export const ARENA_COLLIDERS: readonly Box[] = ARENA_PIECES.map((piece) =>
  boxFromCenter(piece.x, piece.y, piece.z, piece.sizeX, piece.sizeY, piece.sizeZ),
);

/** Cores dos jogadores, para distinguir quem é quem no M1. */
export const PLAYER_COLORS = [
  '#ff8a3d',
  '#43c6ac',
  '#ffd23f',
  '#ef476f',
  '#8ac926',
  '#4d96ff',
  '#c77dff',
  '#ff70a6',
] as const;

export function playerColor(index: number): string {
  const palette = PLAYER_COLORS;
  return palette[((index % palette.length) + palette.length) % palette.length] ?? '#ff8a3d';
}

/**
 * Alvos de interação do M2 (tecla F, raio de 2 m — SPEC §6).
 *
 * Posições provisórias, como o resto da arena: no M4 os NPCs e os baús ficam
 * no greybox das zonas. Aqui eles existem só para a m01 e a m02 serem jogáveis
 * de ponta a ponta.
 */
export type SpotKind = 'npc' | 'objeto' | 'bau' | 'coletavel';

export interface InteractSpot {
  /** Id único do alvo no mundo; o cliente manda este id em `interact`. */
  readonly id: string;
  readonly tipo: SpotKind;
  /**
   * O que o alvo representa no conteúdo: id de NPC, de objeto de missão ou de
   * baú. Vários alvos podem apontar para o mesmo objeto (as 5 caixas do cais).
   */
  readonly alvo: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotulo: string;
  readonly cor: string;
}

/** Distância máxima para interagir, em metros (SPEC §6). */
export const INTERACT_RADIUS = 2;

export const ARENA_SPOTS: readonly InteractSpot[] = [
  {
    id: 'spot_nara',
    tipo: 'npc',
    alvo: 'npc_nara',
    x: 0,
    y: 0,
    z: 3,
    rotulo: 'Capitã Nara',
    cor: '#ef476f',
  },
  {
    id: 'spot_bento',
    tipo: 'npc',
    alvo: 'npc_bento',
    x: -5,
    y: 0,
    z: 10,
    rotulo: 'Seu Bento',
    cor: '#ffd23f',
  },
  {
    id: 'spot_iracema',
    tipo: 'npc',
    alvo: 'npc_iracema',
    x: 5,
    y: 0,
    z: 10,
    rotulo: 'Dona Iracema',
    cor: '#43c6ac',
  },
  // As 5 caixas da m02. Sem colisão nesta fase: quebrar é por jogador, e os
  // colisores são os mesmos para todo mundo. A colisão volta no M3.
  ...[0, 1, 2, 3, 4].map((index) => ({
    id: `spot_caixa_${index + 1}`,
    tipo: 'objeto' as const,
    alvo: 'caixa_quebravel',
    x: -3 + index * 1.5,
    y: 0,
    z: -4,
    rotulo: 'Caixa do cais',
    cor: '#d98b45',
  })),
  // Horta do Seu Bento: as 6 frutas da m03.
  ...[0, 1, 2, 3, 4, 5].map((index) => ({
    id: `spot_fruta_${index + 1}`,
    tipo: 'coletavel' as const,
    alvo: 'fruta',
    x: -9 + (index % 3) * 1.6,
    y: 0,
    z: 13 + Math.floor(index / 3) * 1.6,
    rotulo: 'Fruta da horta',
    cor: '#ef476f',
  })),
  {
    id: 'spot_c01',
    tipo: 'bau',
    alvo: 'c01',
    x: 6,
    y: 0,
    z: -6,
    rotulo: 'Baú atrás do farol',
    cor: '#ffd23f',
  },
];

export function spotById(id: string): InteractSpot | undefined {
  return ARENA_SPOTS.find((spot) => spot.id === id);
}

/** O alvo mais perto do jogador dentro do raio, ou `undefined`. */
export function nearestSpot(
  x: number,
  y: number,
  z: number,
  raio = INTERACT_RADIUS,
): InteractSpot | undefined {
  let best: InteractSpot | undefined;
  let bestDistance = raio;
  for (const spot of ARENA_SPOTS) {
    const distance = Math.hypot(spot.x - x, spot.y - y, spot.z - z);
    if (distance <= bestDistance) {
      best = spot;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Inimigos da arena de testes (M3). São 8 caranguejos comuns, que é o que a
 * m04 pede, mais dois espinhosos para exercitar o golpe que volta de frente
 * (SPEC §7.6).
 *
 * Ficam espalhados, a mais de 7 m uns dos outros, que é o raio em que um
 * bicho percebe o jogador. Aglomerados, os 8 atacariam juntos e o jogador cairia
 * antes de aprender o combo: o combate é para ser um de cada vez, com espaço
 * para esquivar. Também ficam longe dos NPCs, das frutas e do baú, para ninguém
 * ser mordido enquanto conversa.
 */
export interface EnemySpawn {
  readonly id: string;
  /** Id do inimigo no conteúdo: e01, e02… */
  readonly tipo: string;
  readonly x: number;
  readonly z: number;
}

export const ARENA_ENEMIES: readonly EnemySpawn[] = [
  { id: 'e01_1', tipo: 'e01', x: 14, z: 9 },
  { id: 'e01_2', tipo: 'e01', x: 21, z: 7 },
  { id: 'e01_3', tipo: 'e01', x: 21, z: 15 },
  { id: 'e01_4', tipo: 'e01', x: 14, z: 17 },
  { id: 'e01_5', tipo: 'e01', x: 21, z: 22 },
  { id: 'e01_6', tipo: 'e01', x: 6, z: 20 },
  { id: 'e01_7', tipo: 'e01', x: -2, z: 22 },
  { id: 'e01_8', tipo: 'e01', x: -14, z: 22 },
  { id: 'e02_1', tipo: 'e02', x: -16, z: 4 },
  { id: 'e02_2', tipo: 'e02', x: -18, z: -8 },
];

/** Quanto tempo um inimigo derrotado leva para voltar. */
export const ENEMY_RESPAWN_SECONDS = 8;
