import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM } from '@islabr/shared';
import { IslandRoom } from './rooms/IslandRoom.js';

export function createGameServer(): Server {
  const server = new Server({ transport: new WebSocketTransport(), greet: false });
  server.define(ROOM.island, IslandRoom);
  return server;
}
