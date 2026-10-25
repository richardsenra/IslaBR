import { schema, t, type SchemaType } from '@colyseus/schema';
import { EnemyState } from './EnemyState.js';

/**
 * Estado replicado de um jogador. Posições em float32 porque o cliente usa a
 * própria predição para o jogador local e interpola os remotos: meio
 * centímetro de arredondamento não aparece na tela e corta o tráfego.
 */
export const PlayerState = schema(
  {
    x: t.float32(),
    y: t.float32(),
    z: t.float32(),
    yaw: t.float32(),
    /** Estado da máquina do personagem, para o cliente animar o boneco. */
    state: t.string().default('idle'),
    /** Último `seq` aceito, usado na reconciliação. */
    seq: t.number().default(0),
    /** Índice na paleta de cores, só para distinguir os jogadores no M1. */
    colorIndex: t.uint8().default(0),
    /** Corações atuais e máximos, para todos verem quem está ferido. */
    coracoes: t.float32().default(3),
    coracoesMax: t.float32().default(3),
    /** Arma na mão (id do item), para os outros jogadores verem. Vazio = nenhuma. */
    arma: t.string().default(''),
  },
  'PlayerState',
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const IslandState = schema(
  {
    players: t.map(PlayerState),
    inimigos: t.map(EnemyState),
  },
  'IslandState',
);
export type IslandState = SchemaType<typeof IslandState>;
