/** Nomes das salas do Colyseus (SPEC §4). */
export const ROOM = {
  island: 'island',
  home: 'home',
} as const;

export type RoomName = (typeof ROOM)[keyof typeof ROOM];

/** Jogadores por instância da ilha (proposta: 8). */
export const ISLAND_MAX_PLAYERS = 8;

/** Tick do servidor em Hz. */
export const SERVER_TICK_HZ = 20;

export const SERVER_TICK_MS = 1000 / SERVER_TICK_HZ;

export const DEFAULT_SERVER_PORT = 2567;
