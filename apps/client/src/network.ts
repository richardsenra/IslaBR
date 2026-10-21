import { Client } from '@colyseus/sdk';
import { DEFAULT_SERVER_PORT, ROOM } from '@islabr/shared';

/** O cliente só lê o estado; o servidor é a fonte da verdade. */
interface IslandStateView {
  players: { size: number };
}

const serverUrl =
  import.meta.env['VITE_SERVER_URL'] ?? `ws://${window.location.hostname}:${DEFAULT_SERVER_PORT}`;

export async function joinIsland(handlers: {
  onPlayerCount: (count: number) => void;
  onDisconnect: () => void;
}): Promise<void> {
  const client = new Client(serverUrl);
  const room = await client.joinOrCreate<IslandStateView>(ROOM.island);
  room.onStateChange((state) => handlers.onPlayerCount(state.players.size));
  room.onLeave(() => handlers.onDisconnect());
}
