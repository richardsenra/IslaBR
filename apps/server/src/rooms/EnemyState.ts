import { schema, t, type SchemaType } from '@colyseus/schema';

/**
 * Inimigo replicado para a sala. Vida e estado vivem aqui porque todo mundo
 * precisa ver o mesmo bicho; quem decide o valor é só o servidor (SPEC §4).
 */
export const EnemyState = schema(
  {
    /** Id do conteúdo: e01, e02, mb1… */
    tipo: t.string(),
    x: t.float32(),
    y: t.float32(),
    z: t.float32(),
    yaw: t.float32(),
    hp: t.int16(),
    hpMax: t.int16(),
    /** parado | perseguindo | atacando | ferido | morto */
    estado: t.string().default('parado'),
  },
  'EnemyState',
);
export type EnemyState = SchemaType<typeof EnemyState>;
