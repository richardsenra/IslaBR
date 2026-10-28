import { schema, t, type SchemaType } from '@colyseus/schema';

/**
 * Árvore replicada para a sala. Quantos golpes faltam e se está em pé é o que o
 * cliente precisa para desenhar o tronco, o tremor e a queda; quem decide é só
 * o servidor (SPEC §4).
 */
export const TreeState = schema(
  {
    /** Id do recurso em content/resources.json: r01, r02… */
    tipo: t.string(),
    x: t.float32(),
    z: t.float32(),
    /** Golpes que faltam até cair; zero é árvore no chão. */
    golpes: t.uint8(),
    golpesMax: t.uint8(),
  },
  'TreeState',
);
export type TreeState = SchemaType<typeof TreeState>;
