import { z } from 'zod';

/**
 * Peças compartilhadas pelos schemas de conteúdo.
 *
 * Tudo é `strictObject`: campo escrito errado no JSON quebra o teste em vez de
 * virar `undefined` silencioso no jogo.
 */

export const zonaId = z.string().regex(/^z[1-6]$/, 'id de zona: z1 a z6');
export const npcId = z.string().regex(/^npc_[a-z]+$/, 'id de NPC: npc_nome');
export const questId = z.string().regex(/^m\d{2}$/, 'id de missão: m01 a m14');
export const chestId = z.string().regex(/^c\d{2}$/, 'id de baú: c01 a c10');
export const badgeId = z.string().regex(/^b\d{2}$/, 'id de insígnia: b01 a b08');
export const enemyId = z.string().regex(/^(e\d{2}|mb\d|boss\d)$/, 'id de inimigo');
export const itemId = z.string().regex(/^[a-z][a-z0-9_]*$/, 'id de item em snake_case');
export const resourceId = z.string().regex(/^r\d{2}$/, 'id de recurso: r01 em diante');
export const dialogueId = z.string().regex(/^[a-z][a-z0-9_]*$/, 'id de diálogo em snake_case');
/** Pontos do mundo (checkpoints, portas, objetos de puzzle). */
export const spotId = z.string().regex(/^[a-z][a-z0-9_]*$/, 'id de ponto em snake_case');

/** Dano e cura andam de meio em meio coração (SPEC §5). */
export const hearts = z
  .number()
  .min(0)
  .refine((value) => Number.isInteger(value * 2), 'use múltiplos de 0,5 coração');

export const chance = z.number().min(0).max(1);

export const coins = z.number().int().min(0);
export const gems = z.number().int().min(0);

/** Recompensa de missão ou conteúdo de baú. */
export const reward = z.strictObject({
  moedas: coins.default(0),
  joias: gems.default(0),
  /** Ids de item repetidos valem quantidade (duas poções = o id duas vezes). */
  itens: z.array(itemId).default([]),
  insignias: z.array(badgeId).default([]),
  /** Corações máximos ganhos; só a m06 dá (SPEC §13). */
  coracoes: z.number().int().min(0).default(0),
  /** A curva de XP está em aberto (SPEC §12): valores provisórios. */
  xp: z.number().int().min(0).default(0),
});

export type Reward = z.infer<typeof reward>;

/**
 * O que uma missão libera ao ser concluída, além de zonas. Baús e missões são
 * validados contra os arquivos; estes são travas de sistema cuidadas no código.
 */
export const systemUnlock = z.enum([
  'loja',
  'crafting',
  'ilhota',
  'salas_internas',
  'sala_chefe',
  'navio_proxima_ilha',
]);

export type SystemUnlock = z.infer<typeof systemUnlock>;
