import * as THREE from 'three';
import {
  ARENA_COLLIDERS,
  ARENA_SPAWN,
  CLIENT_STEP_MS,
  MOVE_SEND_MS,
  PredictedPlayer,
  SnapshotBuffer,
  duracaoDoGolpe,
  impactoDoGolpe,
  melhorArma,
  moveDirectionFromCamera,
  nearestSpot,
  playerColor,
  proximoGolpe,
  recargaDoGolpeMs,
  spawnPhysics,
  type AttackKind,
  type CharacterState,
  type InteractSpot,
} from '@islabr/shared';
import { Avatar } from './avatar.js';
import { ThirdPersonCamera } from './camera.js';
import { DialogueBox } from './dialogue.js';
import { Effects } from './effects.js';
import { Enemies } from './enemies.js';
import { Hud } from './hud.js';
import { ui } from './i18n.js';
import { InputReader } from './input.js';
import { Rastros } from './rastros.js';
import { InventoryPanel } from './inventory.js';
import { PLAYER_MODELS, carregarModelos, modeloDoJogador } from './models.js';
import {
  joinIsland,
  simulatedLagMs,
  type IslandConnection,
  type NetEnemy,
  type NetPlayer,
} from './network.js';
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
const efeitos = new Effects(byId('numeros'), byId('vermelho'));
const noticeEl = byId('notice');
const gosmaEl = byId('gosma');
const cargaEl = byId('carga');

/** Velocidade de quem está com gosma, em fração da normal. */
const ESCALA_LENTA = 0.5;
/** Até quando o jogador está lento, em ms do relógio do navegador. */
let lentoAte = 0;
let noticeTimer: number | null = null;

function mostrarNotice(texto: string): void {
  noticeEl.hidden = false;
  noticeEl.textContent = texto;
  inventario.avisar(texto);
  if (noticeTimer !== null) window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    noticeEl.hidden = true;
  }, 2200);
}

const inventario = new InventoryPanel(
  byId('inventario'),
  byId('inventario-grade'),
  byId('inventario-detalhe'),
  (itemId) => {
    connection?.useItem(itemId);
  },
);

const { scene, camera, renderer } = createStage(canvas);
scene.add(createArena());

hud.setStatus(ui.loading);
try {
  await carregarModelos([...PLAYER_MODELS]);
} catch (erro) {
  console.error('modelos não carregaram, usando bonecos de primitiva', erro);
}

const spots = new Spots();
scene.add(spots.group);

const enemies = new Enemies();
scene.add(enemies.group);

const rastros = new Rastros();
scene.add(rastros.group);

const input = new InputReader(canvas);
const follow = new ThirdPersonCamera(camera, ARENA_SPAWN.yaw);

const local = new PredictedPlayer(
  spawnPhysics(ARENA_SPAWN.x, ARENA_SPAWN.y, ARENA_SPAWN.z, ARENA_SPAWN.yaw),
  ARENA_COLLIDERS,
);
const localAvatar = new Avatar({ modelo: modeloDoJogador(0), cor: playerColor(0) });
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

let golpeAtual: AttackKind | null = null;
let yawDoGolpe = 0;
let golpeAte = 0;
let golpeLiberadoEm = 0;
let golpeGatilho = 0;
let golpeInicio = 0;
let golpePendente: { golpe: AttackKind; enviarEm: number } | null = null;
/** Quantos golpes normais estão esperando na fila para sair assim que a recarga liberar. */
let golpesNaFila = 0;
/** Se um golpe carregado completou e está esperando a janela abrir. */
let carregarNaFila = false;

const AVANCO_DO_GOLPE: Readonly<Record<AttackKind, number>> = {
  attack1: 0.35,
  attack2: 0.3,
  attack3: 0.5,
  charged: 0.25,
};

let golpeAnimado = 0;
let ultimoGolpe: AttackKind | null = null;
let ultimoGolpeEm = 0;
let machucadoAte = 0;
let opacidadeLocal = 1;

function onPatch(
  players: readonly NetPlayer[],
  inimigos: readonly NetEnemy[],
  arrivedAt: number,
): void {
  const present = new Set<string>();
  enemies.sync(inimigos, arrivedAt);

  for (const player of players) {
    present.add(player.sessionId);

    if (player.sessionId === connection?.sessionId) {
      if (myColorIndex !== player.colorIndex) {
        myColorIndex = player.colorIndex;
        localAvatar.setColor(playerColor(player.colorIndex));
      }
      continue;
    }

    let remote = remotes.get(player.sessionId);
    if (!remote) {
      const modelo = modeloDoJogador(player.colorIndex);
      const avatar = new Avatar({ modelo, cor: playerColor(player.colorIndex) });
      scene.add(avatar.root);
      remote = { avatar, buffer: new SnapshotBuffer() };
      remotes.set(player.sessionId, remote);
    }
    remote.avatar.equipar(player.arma === '' ? null : player.arma);

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

function onDamage(dano: {
  alvo: string;
  valor: number;
  origem: string;
  x: number;
  y: number;
  z: number;
}): void {
  const agora = performance.now();
  const sou = connection?.sessionId;

  if (dano.alvo === sou) {
    if (dano.valor <= 0) return;
    efeitos.numero(new THREE.Vector3(dano.x, local.current.y, dano.z), `-${dano.valor}`, 'jogador');
    efeitos.piscarVermelho(agora);
    efeitos.tremer(0.14, 0.2);
    efeitos.congelar(agora);
    machucadoAte = agora + 320;
    return;
  }

  const posicao = enemies.posicaoDe(dano.alvo);
  if (!posicao) return;

  if (dano.valor > 0) {
    enemies.acertar(dano.alvo);
    efeitos.numero(posicao, String(dano.valor), dano.valor > 1 ? 'carregado' : 'inimigo');
    if (dano.origem === sou) {
      efeitos.congelar(agora);
      efeitos.tremer(dano.valor > 1 ? 0.1 : 0.05);
    }
  } else if (dano.origem === sou) {
    efeitos.numero(posicao, '0', 'neutro');
  }
}

hud.setStatus(ui.connecting);
joinIsland({
  onPatch,
  onDamage,
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
    inventario.atualizar(inventory.itens);
    localAvatar.equipar(melhorArma(inventory.itens));
  },
  onRespawn: (volta) => {
    local.teleport(volta.x, volta.y, volta.z, volta.yaw);
    follow.yaw = volta.yaw;
    golpePendente = null;
    golpeAtual = null;
    golpesNaFila = 0;
    carregarNaFila = false;
    machucadoAte = 0;
    lentoAte = 0;
    efeitos.piscarVermelho(performance.now(), 600);
    mostrarNotice(ui.caiu);
  },
  onStatus: (status) => {
    if (status.tipo === 'lento') lentoAte = performance.now() + status.segundos * 1000;
  },
  onNotice: (notice) => {
    mostrarNotice(ui.avisos[notice.codigo]);
  },
  onLoot: (loot) => {
    hud.mostrarLoot(loot);
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
const MAX_FRAME_SECONDS = 0.25;

let lastFrame = performance.now();
let accumulator = 0;
let sendTimer = 0;
let fps = 60;
let desenhos = 0;

/** Dispara o golpe: anima, registra a cadência e avisa o servidor. */
function dispararGolpe(solto: 'normal' | 'charged', agora: number): void {
  if (!connection || dialogo.aberta) {
    golpesNaFila = 0;
    carregarNaFila = false;
    return;
  }

  const axes = input.readAxes();
  const intencao = moveDirectionFromCamera(axes.forward, axes.strafe, follow.yaw);
  const temInputMovimento = Math.hypot(intencao.x, intencao.z) > 0.1;
  const yawDesejado = temInputMovimento ? Math.atan2(intencao.x, intencao.z) : follow.yaw;

  const p = local.current;
  const alvoAutoAim = enemies.alvoMaisProximo(p.x, p.z, yawDesejado, 3.6);
  yawDoGolpe = alvoAutoAim ? alvoAutoAim.yawParaEle : yawDesejado;

  // O tempo para o combo é medido desde o fim da recarga do golpe anterior
  // ou desde o início dele, garantindo que golpes engatilhados sempre avancem o combo.
  const desdeUltimo = (agora - ultimoGolpeEm) / 1000;
  const golpe: AttackKind =
    solto === 'charged' ? 'charged' : proximoGolpe(ultimoGolpe, desdeUltimo);

  ultimoGolpe = golpe;
  ultimoGolpeEm = agora;
  golpeAtual = golpe;
  golpeInicio = agora;
  golpeAte = agora + duracaoDoGolpe(golpe) * 1000;
  // +20ms de folga garante que o servidor sempre aceite o intervaloMinimoMs
  golpeLiberadoEm = agora + recargaDoGolpeMs(golpe) + 20;
  golpeGatilho += 1;
  golpePendente = { golpe, enviarEm: agora + impactoDoGolpe(golpe) * 1000 };
}

renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - lastFrame) / 1000, MAX_FRAME_SECONDS);
  lastFrame = now;
  fps += (1 / Math.max(dt, 1e-6) - fps) * 0.08;

  const dtAnim = efeitos.congelado(now) ? 0 : dt;

  const look = input.readLook();
  follow.orbit(look.yaw, look.pitch);
  follow.zoom(look.zoom);

  const axes = input.readAxes();
  const andar = moveDirectionFromCamera(axes.forward, axes.strafe, follow.yaw);
  const direction = { x: andar.x, z: andar.z };

  if (golpeAtual && now < golpeInicio + impactoDoGolpe(golpeAtual) * 1000) {
    const andandoComTeclado = Math.hypot(andar.x, andar.z) > 0.1;
    // Só dá o passinho automático do golpe se o jogador estiver parado clicando,
    // para nunca brigar com o WASD nem dar a sensação de controles invertidos!
    if (!andandoComTeclado) {
      const alvoPerto = enemies.alvoMaisProximo(local.current.x, local.current.z, yawDoGolpe, 2.5);
      const fatorDistancia = alvoPerto && alvoPerto.dist < 1.25 ? 0 : 1.0;
      const avanco = AVANCO_DO_GOLPE[golpeAtual] * fatorDistancia;
      direction.x += Math.sin(yawDoGolpe) * avanco;
      direction.z += Math.cos(yawDoGolpe) * avanco;
    }
  }

  let jump = input.consumeJump();
  let dodge = input.consumeDodge();
  const interagir = input.consumeInteract();

  if (input.consumeInventory() && inventario.alternar()) {
    document.exitPointerLock();
  }
  if (inventario.aberto) {
    for (let casa = 0; casa < 9; casa += 1) {
      if (input.consumeKey(`Digit${casa + 1}`)) inventario.usarCasa(casa);
    }
  }
  const lento = now < lentoAte;
  gosmaEl.style.opacity = lento ? '1' : '0';

  // Drena todos os cliques que entraram no InputReader neste frame para a fila de combate
  let acaoAtaque = input.consumeAttack();
  while (acaoAtaque !== null) {
    if (acaoAtaque === 'charged') {
      carregarNaFila = true;
      golpesNaFila = 0;
    } else {
      golpesNaFila = Math.min(golpesNaFila + 1, 3);
    }
    acaoAtaque = input.consumeAttack();
  }

  accumulator = Math.min(accumulator + dt, MAX_FRAME_SECONDS);
  while (accumulator >= STEP_SECONDS) {
    local.step({
      dt: STEP_SECONDS,
      moveX: direction.x,
      moveZ: direction.z,
      jump,
      dodge,
      speedScale: lento ? ESCALA_LENTA : 1,
    });
    accumulator -= STEP_SECONDS;
    jump = false;
    dodge = false;
  }

  const player = local.current;

  // Chegou o instante do impacto: o servidor é avisado e o rastro aparece.
  // (Processado ANTES de disparar o próximo golpe da fila para nunca sobrescrever golpePendente!)
  if (golpePendente && now >= golpePendente.enviarEm) {
    const { golpe } = golpePendente;
    golpePendente = null;
    if (connection) {
      connection.attack({ golpe, yaw: yawDoGolpe });
      rastros.golpe(golpe, player.x, player.y, player.z, yawDoGolpe);
      if (golpe === 'charged') efeitos.tremer(0.18, 0.28);
    }
  }

  // Se a janela de recarga abriu e há golpes na fila, dispara o próximo automaticamente!
  if (now >= golpeLiberadoEm && golpePendente === null) {
    if (carregarNaFila) {
      carregarNaFila = false;
      dispararGolpe('charged', now);
    } else if (golpesNaFila > 0) {
      golpesNaFila -= 1;
      dispararGolpe('normal', now);
    }
  }

  const batendo = golpeAtual !== null && now < golpeAte;
  if (!batendo) golpeAtual = null;

  const perto = nearestSpot(player.x, player.y, player.z);
  alvo = perto && spots.estaVisivel(perto.id) ? perto : undefined;

  if (interagir) {
    if (dialogo.aberta) {
      dialogo.avancar();
    } else if (alvo && connection) {
      connection.interact(alvo.id);
      if (alvo.tipo === 'objeto' || alvo.tipo === 'coletavel') spots.esconder(alvo.id);
    }
  }

  let estadoVisual: CharacterState = player.state;
  let gatilhoVisual = golpeGatilho;

  if (now < machucadoAte) {
    estadoVisual = 'hurt';
  } else if (player.state === 'dodge') {
    estadoVisual = 'dodge';
  } else if (golpeAtual === 'charged') {
    // Em vez de usar a animação de pulo ('charged'), divide o tempo em 3 golpes
    // normais super rápidos (attack1 -> attack2 -> attack3)!
    const progresso = (now - golpeInicio) / (duracaoDoGolpe('charged') * 1000);
    if (progresso < 0.3) {
      estadoVisual = 'attack1';
      gatilhoVisual = golpeGatilho * 10 + 1;
    } else if (progresso < 0.6) {
      estadoVisual = 'attack2';
      gatilhoVisual = golpeGatilho * 10 + 2;
    } else {
      estadoVisual = 'attack3';
      gatilhoVisual = golpeGatilho * 10 + 3;
    }
  } else if (golpeAtual) {
    estadoVisual = golpeAtual;
  }

  // Quando mudar a sub-etapa da rajada, solta o rastro visual correspondente!
  if (golpeAtual === 'charged' && golpeAnimado !== gatilhoVisual) {
    if (estadoVisual === 'attack1') {
      rastros.golpe('attack1', player.x, player.y, player.z, yawDoGolpe);
    } else if (estadoVisual === 'attack2') {
      rastros.golpe('attack2', player.x, player.y, player.z, yawDoGolpe);
    }
  }

  const yawVisual = batendo && golpeAtual ? yawDoGolpe : player.yaw;

  if (connection) {
    sendTimer += dt * 1000;
    if (sendTimer >= MOVE_SEND_MS) {
      sendTimer = Math.min(sendTimer - MOVE_SEND_MS, MOVE_SEND_MS);
      connection.sendMove({ ...local.toMovePayload(), state: estadoVisual, yaw: yawVisual });
    }
  }

  const escondendo = enemies.alertaNaFrente(player.x, player.z, follow.yaw, 4);
  opacidadeLocal += ((escondendo ? 0.35 : 1) - opacidadeLocal) * Math.min(dt * 10, 1);
  localAvatar.setOpacidade(opacidadeLocal);

  localAvatar.place(player.x, player.y, player.z, yawVisual);
  localAvatar.animate(estadoVisual, dtAnim, golpeAnimado !== gatilhoVisual);
  golpeAnimado = gatilhoVisual;

  follow.update(player.x, player.y, player.z, ARENA_COLLIDERS, dt);
  efeitos.tremerCamera(camera, dt);
  spots.update(dtAnim, player, alvo);
  enemies.update(now, dtAnim);
  rastros.update(dtAnim);

  for (const remote of remotes.values()) {
    const pose = remote.buffer.sample(now);
    if (!pose) continue;
    remote.avatar.place(pose.x, pose.y, pose.z, pose.yaw);
    remote.avatar.animate(pose.state, dtAnim);
  }

  cargaEl.hidden = true;

  efeitos.update(dt, now, camera, canvas);

  hud.setDebug({
    fps,
    state: estadoVisual,
    x: player.x,
    y: player.y,
    z: player.z,
    corrections: local.correctionCount,
    draws: desenhos,
  });

  renderer.render(scene, camera);
  desenhos = renderer.info.render.calls;
});
