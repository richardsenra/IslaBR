import { z } from 'zod';
import { zonaId } from './comum.js';

/**
 * Geografia da ilha (SPEC §7.1): onde ficam o chão de cada zona, as peças de
 * colisão, os alvos de interação, as árvores e os bichos. Coordenadas em
 * metros; o chão tem o topo em y = 0.
 */

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'cor no formato #rrggbb');

/** Um retângulo de chão. Cada zona tem uma ou mais áreas. */
export const areaSchema = z.strictObject({
  id: z.string().min(1),
  zona: zonaId,
  minX: z.number(),
  maxX: z.number(),
  minZ: z.number(),
  maxZ: z.number(),
  cor: hexColor,
});

export const pieceKind = z.enum(['ground', 'wall', 'crate', 'platform', 'ceiling']);

export const pieceSchema = z.strictObject({
  id: z.string().min(1),
  kind: pieceKind,
  /** Zona a que a peça pertence; `null` para os muros da borda. */
  zona: zonaId.nullable(),
  /** Centro da caixa. */
  x: z.number(),
  y: z.number(),
  z: z.number(),
  sizeX: z.number().positive(),
  sizeY: z.number().positive(),
  sizeZ: z.number().positive(),
  cor: hexColor,
});

export const spotKind = z.enum(['npc', 'objeto', 'bau', 'coletavel']);

export const spotSchema = z.strictObject({
  id: z.string().min(1),
  tipo: spotKind,
  /** Id de NPC, de objeto de missão ou de baú, conforme o tipo. */
  alvo: z.string().min(1),
  x: z.number(),
  y: z.number(),
  z: z.number(),
  rotulo: z.string().min(1),
  cor: hexColor,
});

export const treeSpawnSchema = z.strictObject({
  id: z.string().min(1),
  /** Id do recurso (r01…). */
  tipo: z.string().min(1),
  x: z.number(),
  z: z.number(),
});

export const enemySpawnSchema = z.strictObject({
  id: z.string().min(1),
  /** Id do inimigo (e01…). */
  tipo: z.string().min(1),
  x: z.number(),
  z: z.number(),
});

export const worldSchema = z.strictObject({
  /** A ilha vai de -limite a +limite em x e z. */
  limite: z.number().positive(),
  spawn: z.strictObject({ x: z.number(), z: z.number(), yaw: z.number() }),
  areas: z.array(areaSchema).min(1),
  pecas: z.array(pieceSchema),
  alvos: z.array(spotSchema),
  arvores: z.array(treeSpawnSchema),
  inimigos: z.array(enemySpawnSchema),
});

export type World = z.infer<typeof worldSchema>;
export type WorldArea = z.infer<typeof areaSchema>;
export type WorldPiece = z.infer<typeof pieceSchema>;
export type WorldSpot = z.infer<typeof spotSchema>;
