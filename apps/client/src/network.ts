import { Client } from '@colyseus/sdk';
import {
  DEFAULT_SERVER_PORT,
  MSG,
  ROOM,
  isCharacterState,
  type AttackPayload,
  type CharacterState,
  type DamagePayload,
  type DialoguePayload,
  type InventoryUpdatePayload,
  type LootPayload,
  type MoveCorrectionPayload,
  type MovePayload,
  type NoticePayload,
  type QuestUpdatePayload,
  type StatusPayload,
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
  /** Id da arma na mão; vazio quando não tem nenhuma. */
  readonly arma: string;
}

/** Inimigo replicado pelo servidor (apps/server/src/rooms/EnemyState.ts). */
interface EnemyView {
  readonly tipo: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly hp: number;
  readonly hpMax: number;
  readonly estado: string;
}

interface MapView<T> {
  readonly size: number;
  forEach(callback: (value: T, key: string) => void): void;
}

interface IslandStateView {
  readonly players: MapView<PlayerView>;
  readonly inimigos: MapView<EnemyView>;
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
  readonly arma: string;
}

export interface NetEnemy {
  readonly id: string;
  readonly tipo: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly hp: number;
  readonly hpMax: number;
  readonly estado: string;
}

export interface IslandHandlers {
  /** Chamado a cada pacote de estado. `arrivedAt` é o relógio local. */
  onPatch(players: readonly NetPlayer[], enemies: readonly NetEnemy[], arrivedAt: number): void;
  onDamage(damage: DamagePayload): void;
  onCorrection(correction: MoveCorrectionPayload): void;
  onDialogue(dialogue: DialoguePayload): void;
  onQuestUpdate(update: QuestUpdatePayload): void;
  onInventory(inventory: InventoryUpdatePayload): void;
  onLoot(loot: LootPayload): void;
  onStatus(status: StatusPayload): void;
  onNotice(notice: NoticePayload): void;
  onDisconnect(): void;
}

export interface IslandConnection {
  readonly sessionId: string;
  sendMove(payload: MovePayload): void;
  /** Tecla F: só manda o id do alvo; quem decide o resto é o servidor. */
  interact(alvo: string): void;
  /** Golpe: só a direção; dano, alcance e cadência são do servidor. */
  attack(payload: AttackPayload): void;
  /** Usar item do inventário; o servidor confere e responde. */
  useItem(item: string): void;
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

const CHAVE_TOKEN = 'islabr.token';

/**
 * Token de convidado guardado no navegador (SPEC §4). É ele que faz o
 * progresso voltar ao recarregar a página. Conta de verdade fica para depois;
 * limpar os dados do site começa um jogador novo.
 */
export function tokenDeConvidado(): string {
  try {
    const guardado = window.localStorage.getItem(CHAVE_TOKEN);
    if (guardado && guardado.length >= 8) return guardado;
    const novo = crypto.randomUUID();
    window.localStorage.setItem(CHAVE_TOKEN, novo);
    return novo;
  } catch {
    // Navegador sem localStorage (aba anônima com restrição): joga como
    // convidado novo, sem salvar.
    return crypto.randomUUID();
  }
}

export async function joinIsland(handlers: IslandHandlers): Promise<IslandConnection> {
  const oneWayMs = simulatedLagMs() / 2;
  const afterLag = (run: () => void): void => {
    if (oneWayMs <= 0) run();
    else window.setTimeout(run, oneWayMs);
  };

  const client = new Client(serverUrl);
  const room = await client.joinOrCreate<IslandStateView>(ROOM.island, {
    token: tokenDeConvidado(),
  });

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
        arma: player.arma,
      });
    });
    const enemies: NetEnemy[] = [];
    state.inimigos.forEach((inimigo, id) => {
      enemies.push({
        id,
        tipo: inimigo.tipo,
        x: inimigo.x,
        y: inimigo.y,
        z: inimigo.z,
        yaw: inimigo.yaw,
        hp: inimigo.hp,
        hpMax: inimigo.hpMax,
        estado: inimigo.estado,
      });
    });
    afterLag(() => {
      handlers.onPatch(players, enemies, performance.now());
    });
  });

  room.onMessage(MSG.moveCorrection, (correction: MoveCorrectionPayload) => {
    afterLag(() => {
      handlers.onCorrection(correction);
    });
  });

  room.onMessage(MSG.dialogue, (dialogue: DialoguePayload) => {
    afterLag(() => {
      handlers.onDialogue(dialogue);
    });
  });

  room.onMessage(MSG.questUpdate, (update: QuestUpdatePayload) => {
    afterLag(() => {
      handlers.onQuestUpdate(update);
    });
  });

  room.onMessage(MSG.inventoryUpdate, (inventory: InventoryUpdatePayload) => {
    afterLag(() => {
      handlers.onInventory(inventory);
    });
  });

  room.onMessage(MSG.damage, (damage: DamagePayload) => {
    afterLag(() => {
      handlers.onDamage(damage);
    });
  });

  room.onMessage(MSG.status, (status: StatusPayload) => {
    afterLag(() => {
      handlers.onStatus(status);
    });
  });

  room.onMessage(MSG.notice, (notice: NoticePayload) => {
    afterLag(() => {
      handlers.onNotice(notice);
    });
  });

  room.onMessage(MSG.loot, (loot: LootPayload) => {
    afterLag(() => {
      handlers.onLoot(loot);
    });
  });

  room.onLeave(() => {
    handlers.onDisconnect();
  });

  // Só agora, com tudo escutando, pedir a carteira e o objetivo atual.
  room.send(MSG.ready, {});

  return {
    sessionId: room.sessionId,
    sendMove: (payload) => {
      afterLag(() => {
        room.send(MSG.move, payload);
      });
    },
    interact: (alvo) => {
      afterLag(() => {
        room.send(MSG.interact, { alvo });
      });
    },
    attack: (payload) => {
      afterLag(() => {
        room.send(MSG.attack, payload);
      });
    },
    useItem: (item) => {
      afterLag(() => {
        room.send(MSG.useItem, { item });
      });
    },
    leave: () => {
      void room.leave();
    },
  };
}
