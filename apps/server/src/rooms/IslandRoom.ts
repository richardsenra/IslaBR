import { Room, type Client } from '@colyseus/core';
import { ISLAND_MAX_PLAYERS, SERVER_TICK_MS } from '@islabr/shared';
import { IslandState, PlayerState } from './IslandState.js';

export class IslandRoom extends Room<{ state: IslandState }> {
  override maxClients = ISLAND_MAX_PLAYERS;
  override patchRate = SERVER_TICK_MS;
  override state = new IslandState();

  override onJoin(client: Client): void {
    this.state.players.set(client.sessionId, new PlayerState());
  }

  override onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
  }
}
