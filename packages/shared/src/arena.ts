/**
 * A ilha (greybox das zonas z1–z5 do M4).
 *
 * A geografia vem de `packages/content/data/world.json`; aqui ela vira os
 * tipos que cliente e servidor usam. Fica em `shared` porque o servidor valida
 * posições contra os mesmos colisores que o cliente desenha. Os nomes ainda
 * dizem ARENA_ por herança do M1.
 */

import { content } from '@islabr/content';
import { boxFromCenter, type Box } from './collision.js';

export type ArenaPieceKind = 'ground' | 'wall' | 'crate' | 'platform' | 'ceiling';

export interface ArenaPiece {
  readonly id: string;
  readonly kind: ArenaPieceKind;
  /** Zona da peça; `null` nos muros da borda. */
  readonly zona: string | null;
  /** Centro da caixa. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
  readonly color: string;
  /** `false` quando um modelo do cenário desenha no lugar da caixa. */
  readonly visivel: boolean;
}

const WORLD = content.world;

/** A ilha vai de -ARENA_LIMITE a +ARENA_LIMITE em x e z. */
export const ARENA_LIMITE = WORLD.limite;

export const ARENA_SPAWN = { x: WORLD.spawn.x, y: 0, z: WORLD.spawn.z, yaw: WORLD.spawn.yaw };

/** Chão de cada área: uma laje de 1 m com o topo em y = 0. */
const ARENA_GROUND: readonly ArenaPiece[] = WORLD.areas.map((area) => ({
  id: `chao_${area.id}`,
  kind: 'ground',
  zona: area.zona,
  x: (area.minX + area.maxX) / 2,
  y: -0.5,
  z: (area.minZ + area.maxZ) / 2,
  sizeX: area.maxX - area.minX,
  sizeY: 1,
  sizeZ: area.maxZ - area.minZ,
  color: area.cor,
  visivel: true,
}));

export const ARENA_PIECES: readonly ArenaPiece[] = [
  ...ARENA_GROUND,
  ...WORLD.pecas.map((piece) => ({
    id: piece.id,
    kind: piece.kind,
    zona: piece.zona,
    x: piece.x,
    y: piece.y,
    z: piece.z,
    sizeX: piece.sizeX,
    sizeY: piece.sizeY,
    sizeZ: piece.sizeZ,
    color: piece.cor,
    visivel: piece.visivel ?? true,
  })),
];

/** Largura da caixa de colisão do tronco, em metros. */
export const TREE_TRUNK_WIDTH = 0.7;

export interface TreeSpawn {
  readonly id: string;
  /** Id do recurso em content/resources.json. */
  readonly tipo: string;
  readonly x: number;
  readonly z: number;
}

export const ARENA_TREES: readonly TreeSpawn[] = WORLD.arvores;
/**
 * Altura do colisor do tronco. O jogador não atravessa a árvore, mas pula em
 * cima do toco; e como o toco fica no lugar depois de ela cair, o colisor é o
 * mesmo em pé ou derrubada, sem precisar mudar a colisão em tempo de jogo.
 */
export const TREE_COLLIDER_HEIGHT = 0.5;

export const ARENA_TREE_COLLIDERS: readonly Box[] = ARENA_TREES.map((tree) =>
  boxFromCenter(
    tree.x,
    TREE_COLLIDER_HEIGHT / 2,
    tree.z,
    TREE_TRUNK_WIDTH,
    TREE_COLLIDER_HEIGHT,
    TREE_TRUNK_WIDTH,
  ),
);

export const ARENA_COLLIDERS: readonly Box[] = [
  ...ARENA_PIECES.map((piece) =>
    boxFromCenter(piece.x, piece.y, piece.z, piece.sizeX, piece.sizeY, piece.sizeZ),
  ),
  ...ARENA_TREE_COLLIDERS,
];

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
 * Alvos de interação (tecla F, raio de 2 m — SPEC §6): NPCs, baús, objetos de
 * missão e coletáveis, posicionados em world.json.
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

export const ARENA_SPOTS: readonly InteractSpot[] = WORLD.alvos.map((spot) => ({
  id: spot.id,
  tipo: spot.tipo,
  alvo: spot.alvo,
  x: spot.x,
  y: spot.y,
  z: spot.z,
  rotulo: spot.rotulo,
  cor: spot.cor,
}));

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
 * Inimigos da ilha, de world.json. Ficam a mais de 7 m uns dos outros, que é o
 * raio em que um bicho percebe o jogador: o combate é um de cada vez, com
 * espaço para esquivar. Também ficam longe dos NPCs, das frutas e dos baús.
 */
export interface EnemySpawn {
  readonly id: string;
  /** Id do inimigo no conteúdo: e01, e02… */
  readonly tipo: string;
  readonly x: number;
  readonly z: number;
}

export const ARENA_ENEMIES: readonly EnemySpawn[] = WORLD.inimigos;

/** Quanto tempo um inimigo derrotado leva para voltar. */
export const ENEMY_RESPAWN_SECONDS = 8;

/** Parede que fecha uma zona enquanto a missão que a libera não foi aceita. */
export interface ArenaGate {
  readonly id: string;
  readonly zona: string;
  readonly box: Box;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
}

export const ARENA_GATES: readonly ArenaGate[] = WORLD.portoes.map((gate) => ({
  id: gate.id,
  zona: gate.zona,
  x: gate.x,
  y: gate.y,
  z: gate.z,
  sizeX: gate.sizeX,
  sizeY: gate.sizeY,
  sizeZ: gate.sizeZ,
  box: boxFromCenter(gate.x, gate.y, gate.z, gate.sizeX, gate.sizeY, gate.sizeZ),
}));

/**
 * Zonas abertas para quem tem este livro de missões (SPEC §7.1): a zona abre
 * quando a missão que a libera é **aceita**, ou seja, está em andamento ou
 * concluída. `liberada_por: null` é aberta desde o início.
 */
export function zonasAbertas(
  book: Readonly<Record<string, { readonly status: string }>>,
  todasAbertas = false,
): ReadonlySet<string> {
  const abertas = new Set<string>();
  for (const zona of content.zones) {
    const missao = zona.liberada_por;
    if (todasAbertas || missao === null) {
      abertas.add(zona.id);
      continue;
    }
    const status = book[missao]?.status;
    if (status === 'active' || status === 'done') abertas.add(zona.id);
  }
  return abertas;
}

/** Colisores que valem para quem tem estas zonas abertas: o mundo e os portões fechados. */
export function colisoresPara(abertas: ReadonlySet<string>): Box[] {
  return [
    ...ARENA_COLLIDERS,
    ...ARENA_GATES.filter((gate) => !abertas.has(gate.zona)).map((gate) => gate.box),
  ];
}
