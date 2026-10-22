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
