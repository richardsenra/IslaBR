import { schema, t, type SchemaType } from '@colyseus/schema';

export const PlayerState = schema(
  {
    x: t.number(),
    y: t.number(),
    z: t.number(),
  },
  'PlayerState',
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const IslandState = schema(
  {
    players: t.map(PlayerState),
  },
  'IslandState',
);
export type IslandState = SchemaType<typeof IslandState>;
