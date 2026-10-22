import {
  ARENA_COLLIDERS,
  ARENA_SPAWN,
  CLIENT_STEP_MS,
  MOVE_SEND_MS,
  PredictedPlayer,
  SnapshotBuffer,
  moveDirectionFromCamera,
  nearestSpot,
  playerColor,
  spawnPhysics,
  type InteractSpot,
} from '@islabr/shared';
import { Avatar } from './avatar.js';
import { ThirdPersonCamera } from './camera.js';
import { DialogueBox } from './dialogue.js';
import { Hud } from './hud.js';
import { ui } from './i18n.js';
import { InputReader } from './input.js';
import { joinIsland, simulatedLagMs, type IslandConnection, type NetPlayer } from './network.js';
import { createStage } from './scene.js';
import { Spots } from './spots.js';
import { createArena } from './world.js';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Elemento #${id} não encontrado`);
  return el as T;
}

const canvas = byId<HTMLCanvasElement>('game');
const hud = new Hud(
  {
    players: byId('players'),
    debug: byId('debug'),
    help: byId('help'),
    carteira: byId('carteira'),
    objetivo: byId('objetivo'),
    loot: byId('loot'),
  },
  simulatedLagMs(),
);
const dialogo = new DialogueBox(
  byId('dialogo'),
  byId('dialogo-npc'),
  byId('dialogo-texto'),
  byId('dialogo-rodape'),
);

const { scene, camera, renderer } = createStage(canvas);
scene.add(createArena());

const spots = new Spots();
scene.add(spots.group);

const input = new InputReader(canvas);
const follow = new ThirdPersonCamera(camera, ARENA_SPAWN.yaw);

const local = new PredictedPlayer(
  spawnPhysics(ARENA_SPAWN.x, ARENA_SPAWN.y, ARENA_SPAWN.z, ARENA_SPAWN.yaw),
  ARENA_COLLIDERS,
);
const localAvatar = new Avatar(playerColor(0));
scene.add(localAvatar.root);

interface RemoteAvatar {
  readonly avatar: Avatar;
  readonly buffer: SnapshotBuffer;
}

const remotes = new Map<string, RemoteAvatar>();
let connection: IslandConnection | null = null;
let myColorIndex: number | null = null;
/** Alvo que o ícone flutuante está marcando agora. */
let alvo: InteractSpot | undefined;

function onPatch(players: readonly NetPlayer[], arrivedAt: number): void {
  const present = new Set<string>();

  for (const player of players) {
    present.add(player.sessionId);

    if (player.sessionId === connection?.sessionId) {
      // O jogador local é desenhado pela predição; daqui só vem a cor.
      if (myColorIndex !== player.colorIndex) {
        myColorIndex = player.colorIndex;
        localAvatar.setColor(playerColor(player.colorIndex));
      }
      continue;
    }

    let remote = remotes.get(player.sessionId);
    if (!remote) {
      const avatar = new Avatar(playerColor(player.colorIndex));
      scene.add(avatar.root);
      remote = { avatar, buffer: new SnapshotBuffer() };
      remotes.set(player.sessionId, remote);
    }

    remote.buffer.push({
      t: arrivedAt,
      x: player.x,
      y: player.y,
      z: player.z,
      yaw: player.yaw,
      state: player.state,
    });
  }

  for (const [sessionId, remote] of remotes) {
    if (present.has(sessionId)) continue;
    scene.remove(remote.avatar.root);
    remote.avatar.dispose();
    remotes.delete(sessionId);
  }

  hud.setPlayerCount(players.length);
}

hud.setStatus(ui.connecting);
joinIsland({
  onPatch,
  onCorrection: (correction) => {
    local.applyCorrection(correction);
  },
  onDialogue: (payload) => {
    dialogo.abrir(payload);
  },
  onQuestUpdate: (update) => {
    hud.setObjetivo(update);
  },
  onInventory: (inventory) => {
    hud.setCarteira(inventory);
  },
  onLoot: (loot) => {
    hud.mostrarLoot(loot);
    // O que foi recolhido some do mundo para este jogador.
    if (alvo?.tipo === 'bau') spots.esconder(alvo.id);
  },
  onDisconnect: () => {
    hud.setStatus(ui.disconnected);
    connection = null;
    for (const remote of remotes.values()) {
      scene.remove(remote.avatar.root);
      remote.avatar.dispose();
    }
    remotes.clear();
  },
})
  .then((joined) => {
    connection = joined;
  })
  .catch((error: unknown) => {
    console.error(error);
    hud.setStatus(ui.offline);
  });

const STEP_SECONDS = CLIENT_STEP_MS / 1000;
/** Mais que isto num quadro e o acumulador é descartado, para não disparar. */
const MAX_FRAME_SECONDS = 0.25;

let lastFrame = performance.now();
let accumulator = 0;
let sendTimer = 0;
let fps = 60;

renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - lastFrame) / 1000, MAX_FRAME_SECONDS);
  lastFrame = now;
  fps += (1 / Math.max(dt, 1e-6) - fps) * 0.08;

  const look = input.readLook();
  follow.orbit(look.yaw, look.pitch);
  follow.zoom(look.zoom);

  const axes = input.readAxes();
  const direction = moveDirectionFromCamera(axes.forward, axes.strafe, follow.yaw);
  let jump = input.consumeJump();
  let dodge = input.consumeDodge();
  const interagir = input.consumeInteract();

  // Passo fixo: a simulação do cliente é igual à que o servidor valida.
  accumulator = Math.min(accumulator + dt, MAX_FRAME_SECONDS);
  while (accumulator >= STEP_SECONDS) {
    local.step({
      dt: STEP_SECONDS,
      moveX: direction.x,
      moveZ: direction.z,
      jump,
      dodge,
    });
    accumulator -= STEP_SECONDS;
    jump = false;
    dodge = false;
  }

  const player = local.current;

  // Alvo da tecla F: o mais perto dentro do raio, que ainda esteja no mundo.
  const perto = nearestSpot(player.x, player.y, player.z);
  alvo = perto && spots.estaVisivel(perto.id) ? perto : undefined;

  if (interagir) {
    // Com fala aberta, F passa a caixa; senão, interage com o alvo.
    if (dialogo.aberta) {
      dialogo.avancar();
    } else if (alvo && connection) {
      connection.interact(alvo.id);
      if (alvo.tipo === 'objeto') spots.esconder(alvo.id);
    }
  }

  if (connection) {
    sendTimer += dt * 1000;
    if (sendTimer >= MOVE_SEND_MS) {
      // Guarda o resto para o envio manter os 20 Hz, e não cair para 15.
      sendTimer = Math.min(sendTimer - MOVE_SEND_MS, MOVE_SEND_MS);
      connection.sendMove(local.toMovePayload());
    }
  }

  localAvatar.place(player.x, player.y, player.z, player.yaw);
  localAvatar.animate(player.state, dt);
  follow.update(player.x, player.y, player.z, ARENA_COLLIDERS, dt);
  spots.update(dt, player, alvo);

  for (const remote of remotes.values()) {
    const pose = remote.buffer.sample(now);
    if (!pose) continue;
    remote.avatar.place(pose.x, pose.y, pose.z, pose.yaw);
    remote.avatar.animate(pose.state, dt);
  }

  hud.setDebug({
    fps,
    state: player.state,
    x: player.x,
    y: player.y,
    z: player.z,
    corrections: local.correctionCount,
  });

  renderer.render(scene, camera);
});
