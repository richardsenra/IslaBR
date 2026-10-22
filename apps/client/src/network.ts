import { Client } from '@colyseus/sdk';
import {
  DEFAULT_SERVER_PORT,
  MSG,
  ROOM,
  isCharacterState,
  type CharacterState,
  type MoveCorrectionPayload,
  type MovePayload,
} from '@islabr/shared';

/**
 * Conexão com a sala `island`. O cliente só lê o estado replicado: quem decide
 * é o servidor (SPEC §4).
 */

/** Visão mínima do estado do servidor, para não importar o schema dele aqui. */
interface PlayerView {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly state: string;
  readonly seq: number;
  readonly colorIndex: number;
}

interface MapView<T> {
  readonly size: number;
  forEach(callback: (value: T, key: string) => void): void;
}

interface IslandStateView {
  readonly players: MapView<PlayerView>;
}

export interface NetPlayer {
  readonly sessionId: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly state: CharacterState;
  readonly seq: number;
  readonly colorIndex: number;
}

export interface IslandHandlers {
  /** Chamado a cada pacote de estado. `arrivedAt` é o relógio local. */
  onPatch(players: readonly NetPlayer[], arrivedAt: number): void;
  onCorrection(correction: MoveCorrectionPayload): void;
  onDisconnect(): void;
}

export interface IslandConnection {
  readonly sessionId: string;
  sendMove(payload: MovePayload): void;
  leave(): void;
}

const serverUrl =
  import.meta.env['VITE_SERVER_URL'] ?? `ws://${window.location.hostname}:${DEFAULT_SERVER_PORT}`;

/**
 * Latência simulada de ida e volta, via `?lag=100` na URL. Serve para conferir
 * o critério de aceite do M1 sem precisar de um servidor remoto.
 */
export function simulatedLagMs(): number {
  const raw = new URLSearchParams(window.location.search).get('lag');
  const value = raw === null ? 0 : Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 2000) : 0;
}

function toCharacterState(value: string): CharacterState {
  return isCharacterState(value) ? value : 'idle';
}

export async function joinIsland(handlers: IslandHandlers): Promise<IslandConnection> {
  const oneWayMs = simulatedLagMs() / 2;
  const afterLag = (run: () => void): void => {
    if (oneWayMs <= 0) run();
    else window.setTimeout(run, oneWayMs);
  };

  const client = new Client(serverUrl);
  const room = await client.joinOrCreate<IslandStateView>(ROOM.island);

  room.onStateChange((state) => {
    const players: NetPlayer[] = [];
    state.players.forEach((player, sessionId) => {
      players.push({
        sessionId,
        x: player.x,
        y: player.y,
        z: player.z,
        yaw: player.yaw,
        state: toCharacterState(player.state),
        seq: player.seq,
        colorIndex: player.colorIndex,
      });
    });
    afterLag(() => {
      handlers.onPatch(players, performance.now());
    });
  });

  room.onMessage(MSG.moveCorrection, (correction: MoveCorrectionPayload) => {
    afterLag(() => {
      handlers.onCorrection(correction);
    });
  });

  room.onLeave(() => {
    handlers.onDisconnect();
  });

  return {
    sessionId: room.sessionId,
    sendMove: (payload) => {
      afterLag(() => {
        room.send(MSG.move, payload);
      });
    },
    leave: () => {
      void room.leave();
    },
  };
}
