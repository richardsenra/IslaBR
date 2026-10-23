import { z } from 'zod';
import {
  badgeId,
  chance,
  chestId,
  coins,
  dialogueId,
  enemyId,
  gems,
  hearts,
  itemId,
  npcId,
  questId,
  reward,
  spotId,
  systemUnlock,
  zonaId,
} from './comum.js';

export * from './comum.js';

/** SPEC §7.1 */
export const zoneSchema = z.strictObject({
  id: zonaId,
  nome: z.string().min(1),
  funcao: z.string().min(1),
  nivel: z.strictObject({ min: z.number().int().min(1), max: z.number().int().min(1) }),
  /** Zona abre quando o jogador **aceita** esta missão (SPEC §7.1). */
  liberada_por: questId.nullable(),
});

/** SPEC §7.2 */
export const npcSchema = z.strictObject({
  id: npcId,
  nome: z.string().min(1),
  papel: z.string().min(1),
  zonas: z.array(zonaId).min(1),
  missoes: z.array(questId),
  dialogo_ocioso: dialogueId,
});

/**
 * Objetivos de missão (SPEC §8). Os tipos são os seis da spec; os campos de
 * cada um são escolha deste projeto.
 */
const questPart = z.discriminatedUnion('objetivo', [
  z.strictObject({
    objetivo: z.literal('talk'),
    npc: npcId,
    texto: z.string().min(1),
    dica: z.string().min(1).optional(),
  }),
  z.strictObject({
    objetivo: z.literal('collect'),
    item: itemId,
    qtd: z.number().int().min(1),
    texto: z.string().min(1),
    dica: z.string().min(1).optional(),
  }),
  z.strictObject({
    objetivo: z.literal('kill'),
    inimigo: enemyId,
    qtd: z.number().int().min(1),
    texto: z.string().min(1),
    dica: z.string().min(1).optional(),
  }),
  z.strictObject({
    objetivo: z.literal('reach'),
    /** Todos os pontos contam uma vez; a ordem só importa se `em_ordem`. */
    pontos: z.array(spotId).min(1),
    em_ordem: z.boolean().default(false),
    texto: z.string().min(1),
    dica: z.string().min(1).optional(),
  }),
  z.strictObject({
    objetivo: z.literal('use'),
    objeto: spotId,
    qtd: z.number().int().min(1).default(1),
    texto: z.string().min(1),
    dica: z.string().min(1).optional(),
  }),
  z.strictObject({
    objetivo: z.literal('defeat_boss'),
    chefe: enemyId,
    texto: z.string().min(1),
    dica: z.string().min(1).optional(),
  }),
]);

export type QuestPart = z.infer<typeof questPart>;
export type QuestObjective = QuestPart['objetivo'];

/** SPEC §7.3 */
export const questSchema = z.strictObject({
  id: questId,
  titulo: z.string().min(1),
  /** Quem dá a missão. */
  npc: npcId,
  requer: z.array(questId),
  partes: z.array(questPart).min(1),
  dialogo_entrada: dialogueId,
  dialogo_conclusao: dialogueId,
  recompensa: reward,
  /** Zonas abrem ao aceitar, porque o objetivo fica dentro delas (SPEC §7.1). */
  libera_ao_aceitar: z.array(zonaId),
  /** Baús, missões e travas de sistema abrem ao concluir. */
  libera: z.array(z.union([chestId, questId, systemUnlock])),
});

/** SPEC §7.4 */
export const chestSchema = z.strictObject({
  id: chestId,
  zona: zonaId,
  local: z.string().min(1),
  tipo: z.enum(['free', 'locked', 'hidden', 'quest']),
  /** Itens, missões ou chefes exigidos para abrir. */
  requer: z.array(z.union([itemId, questId, enemyId])),
  como_abrir: z.string().min(1),
  conteudo: reward,
});

/** SPEC §7.5 */
export const badgeSchema = z.strictObject({
  id: badgeId,
  feito: z.string().min(1),
  condicao: z.discriminatedUnion('tipo', [
    z.strictObject({ tipo: z.literal('reach'), ponto: spotId }),
    z.strictObject({ tipo: z.literal('bau'), bau: chestId }),
    z.strictObject({ tipo: z.literal('missao'), missao: questId }),
    z.strictObject({ tipo: z.literal('chefe_sem_dano'), chefe: enemyId }),
    /** Feito medido por código, sem dado extra (ex.: pântano sem pisar na água). */
    z.strictObject({ tipo: z.literal('proeza'), proeza: spotId }),
  ]),
});

const drop = z.discriminatedUnion('tipo', [
  z.strictObject({
    tipo: z.literal('item'),
    item: itemId,
    chance,
    qtd: z.number().int().min(1).default(1),
  }),
  z.strictObject({
    tipo: z.literal('moedas'),
    chance,
    min: coins.min(1),
    max: coins.min(1),
  }),
]);

/**
 * Como o inimigo se comporta no servidor (SPEC §7.6). Os números moram aqui, no
 * JSON, e não no código: balancear um inimigo não deve pedir mexer na IA.
 * Velocidade em m/s, distâncias em metros, tempos em segundos.
 */
const iaComum = {
  velocidade: z.number().positive(),
  /** Distância em que o bicho percebe o jogador. */
  aggro: z.number().positive(),
  /** Distância em que consegue atacar. */
  alcance: z.number().positive(),
  /** Espera entre dois ataques. */
  recarga: z.number().positive(),
};

export const iaSchema = z.discriminatedUnion('tipo', [
  /** Anda atrás do jogador e belisca de perto (caranguejos). */
  z.strictObject({
    tipo: z.literal('perseguidor'),
    ...iaComum,
    /** Devolve o golpe que vem de frente; só pelas costas machuca (e02). */
    reflete_de_frente: z.boolean().default(false),
  }),
  /** Voa em círculos sobre o jogador e mergulha (mosquito). */
  z.strictObject({
    tipo: z.literal('voador'),
    ...iaComum,
    altura: z.number().positive(),
    raio_orbita: z.number().positive(),
    velocidade_mergulho: z.number().positive(),
    /** Aviso antes de mergulhar, para dar tempo de reagir. */
    aviso: z.number().positive(),
  }),
  /** Pula até o jogador e cospe gosma que deixa lento (sapo). */
  z.strictObject({
    tipo: z.literal('saltador'),
    ...iaComum,
    duracao_pulo: z.number().positive(),
    alcance_cuspe: z.number().positive(),
    recarga_cuspe: z.number().positive(),
    aviso_cuspe: z.number().positive(),
    lento_segundos: z.number().positive(),
  }),
  /** Flutua devagar e dá choque em área depois de carregar (água-viva). */
  z.strictObject({
    tipo: z.literal('flutuante'),
    ...iaComum,
    altura: z.number().min(0),
    carga: z.number().positive(),
  }),
]);

export type Ia = z.infer<typeof iaSchema>;

/** SPEC §7.6 */
export const enemySchema = z.strictObject({
  id: enemyId,
  nome: z.string().min(1),
  tipo: z.enum(['comum', 'mini_chefe', 'chefe']),
  zonas: z.array(zonaId).min(1),
  /** HP em golpes do Graveto Reforçado (1 de dano por golpe). */
  hp: z.number().int().min(1),
  dano: hearts,
  comportamento: z.string().min(1),
  /** Obrigatória para inimigo comum; chefes ganham a deles nos M4 e M5. */
  ia: iaSchema.optional(),
  drops: z.array(drop),
  /** Só o chefe tem fases (SPEC §7.6). */
  fases: z
    .array(z.strictObject({ hp: z.number().int().min(1), descricao: z.string().min(1) }))
    .optional(),
});

/** SPEC §7.7 */
export const itemSchema = z.strictObject({
  id: itemId,
  nome: z.string().min(1),
  tipo: z.enum([
    'arma',
    'armadura',
    'equipamento',
    'consumivel',
    'ingrediente',
    'chave',
    'missao',
    'receita',
  ]),
  descricao: z.string().min(1),
  empilhavel: z.boolean(),
  /** Chaves e itens de missão não gastam no uso (SPEC §7.4). */
  consumivel: z.boolean(),
  vendavel: z.boolean(),
  descartavel: z.boolean(),
  /** Em vez de ir para o inventário, faz efeito na hora (coração pequeno). */
  usa_ao_pegar: z.boolean().default(false),
  efeito: z
    .strictObject({
      dano: z.number().min(0).optional(),
      cura_coracoes: hearts.optional(),
      cura_tudo: z.boolean().optional(),
      coracoes_temporarios: hearts.optional(),
      duracao_s: z.number().int().min(1).optional(),
      reduz_dano: hearts.optional(),
      ensina_receita: z.string().min(1).optional(),
    })
    .optional(),
});

/** SPEC §7.7 */
export const recipeSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  resultado: z.strictObject({ item: itemId, qtd: z.number().int().min(1) }),
  ingredientes: z.array(z.strictObject({ item: itemId, qtd: z.number().int().min(1) })).min(1),
  /** Missão ou baú que ensina a receita. */
  aprendida_em: z.union([questId, chestId]),
});

/** SPEC §7.7: a loja aceita preço em moedas, joias e itens. */
export const shopSchema = z.strictObject({
  npc: npcId,
  liberada_por: questId,
  itens: z
    .array(
      z.strictObject({
        item: itemId,
        custo: z.strictObject({
          moedas: coins.default(0),
          joias: gems.default(0),
          itens: z
            .array(z.strictObject({ item: itemId, qtd: z.number().int().min(1) }))
            .default([]),
        }),
      }),
    )
    .min(1),
});

/** Falas dos NPCs: até 3 caixas por fala (SPEC §7.2). */
export const dialogueSchema = z.strictObject({
  npc: npcId,
  caixas: z.array(z.string().min(1)).min(1).max(3),
  opcoes: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        texto: z.string().min(1),
        vai_para: dialogueId.optional(),
      }),
    )
    .optional(),
});

export const zonesFile = z.array(zoneSchema).min(1);
export const npcsFile = z.array(npcSchema).min(1);
export const questsFile = z.array(questSchema).min(1);
export const chestsFile = z.array(chestSchema).min(1);
export const badgesFile = z.array(badgeSchema).min(1);
export const enemiesFile = z.array(enemySchema).min(1);
export const itemsFile = z.array(itemSchema).min(1);
export const recipesFile = z.array(recipeSchema).min(1);
export const dialoguesFile = z.record(dialogueId, dialogueSchema);

export type Zone = z.infer<typeof zoneSchema>;
export type Npc = z.infer<typeof npcSchema>;
export type Quest = z.infer<typeof questSchema>;
export type Chest = z.infer<typeof chestSchema>;
export type Badge = z.infer<typeof badgeSchema>;
export type Enemy = z.infer<typeof enemySchema>;
export type Item = z.infer<typeof itemSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type Shop = z.infer<typeof shopSchema>;
export type Dialogue = z.infer<typeof dialogueSchema>;
export type Drop = z.infer<typeof drop>;
