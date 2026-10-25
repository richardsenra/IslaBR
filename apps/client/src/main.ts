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
const cargaBarraEl = byId('carga-barra');

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

// Os modelos precisam estar na memória antes de qualquer boneco ser criado;
// se a rede falhar, o jogo segue com o boneco de primitivas.
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

/**
 * Estado do golpe do jogador local. O servidor é quem decide o dano; isto só
 * guarda o que animar e quando o próximo golpe pode sair, com a mesma conta de
 * cadência do servidor para o cliente não mandar golpe que seria recusado.
 */
let golpeAtual: AttackKind | null = null;
let golpeAte = 0;
let golpeLiberadoEm = 0;
let golpeGatilho = 0;
/** Quando o golpe em curso começou, para o avanço durar só até o impacto. */
let golpeInicio = 0;
/**
 * O dano só sai no impacto, não no clique: o golpe fica pendente até a lâmina
 * chegar. Assim o número aparece quando a espada acerta e não antes de o braço
 * descer. A recarga impede dois pendentes ao mesmo tempo.
 */
let golpePendente: { golpe: AttackKind; enviarEm: number } | null = null;
/**
 * Quanto o personagem avança para dentro do golpe, em fração da velocidade de
 * corrida, até o impacto. Dá peso ao golpe e fecha a distância até o bicho; o
 * carregado é um salto.
 */
const AVANCO_DO_GOLPE: Readonly<Record<AttackKind, number>> = {
  attack1: 0.35,
  attack2: 0.3,
  attack3: 0.5,
  charged: 0.6,
};
let golpeAnimado = 0;
let ultimoGolpe: AttackKind | null = null;
let ultimoGolpeEm = 0;
let machucadoAte = 0;
/** Opacidade atual do boneco local; sobe e desce suave, sem piscar. */
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
      // O jogador local é desenhado pela predição; daqui só vem a cor.
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

/** Dano decidido pelo servidor chegou: dá peso ao que o jogador vê. */
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
    // Eu apanhei.
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
    // Só quem bateu sente o peso do golpe.
    if (dano.origem === sou) {
      efeitos.congelar(agora);
      efeitos.tremer(dano.valor > 1 ? 0.1 : 0.05);
    }
  } else if (dano.origem === sou) {
    // O espinhoso devolveu o golpe: bateu, mas não adiantou.
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
    // A arma na mão é a melhor do inventário: a mesma regra que o servidor usa
    // para decidir o dano.
    localAvatar.equipar(melhorArma(inventory.itens));
  },
  onRespawn: (volta) => {
    // Morreu e renasceu: a predição vai para o ponto de volta, sem arrastar os
    // comandos de onde caiu, e o que estava em curso é cancelado.
    local.teleport(volta.x, volta.y, volta.z, volta.yaw);
    follow.yaw = volta.yaw;
    golpePendente = null;
    golpeAtual = null;
    machucadoAte = 0;
    lentoAte = 0;
    efeitos.piscarVermelho(performance.now(), 600);
    mostrarNotice(ui.caiu);
  },
  onStatus: (status) => {
    // A gosma deixa o jogador lento; quanto, e por quanto tempo, o servidor diz.
    if (status.tipo === 'lento') lentoAte = performance.now() + status.segundos * 1000;
  },
  onNotice: (notice) => {
    mostrarNotice(ui.avisos[notice.codigo]);
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
let desenhos = 0;

/** Dispara o golpe: anima, registra a cadência e avisa o servidor. */
function atacar(solto: 'normal' | 'charged', agora: number): void {
  if (!connection || dialogo.aberta || agora < golpeLiberadoEm) return;

  const golpe: AttackKind =
    solto === 'charged' ? 'charged' : proximoGolpe(ultimoGolpe, (agora - ultimoGolpeEm) / 1000);

  ultimoGolpe = golpe;
  ultimoGolpeEm = agora;
  golpeAtual = golpe;
  golpeInicio = agora;
  golpeAte = agora + duracaoDoGolpe(golpe) * 1000;
  golpeLiberadoEm = agora + recargaDoGolpeMs(golpe);
  golpeGatilho += 1;
  golpePendente = { golpe, enviarEm: agora + impactoDoGolpe(golpe) * 1000 };
}

renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - lastFrame) / 1000, MAX_FRAME_SECONDS);
  lastFrame = now;
  fps += (1 / Math.max(dt, 1e-6) - fps) * 0.08;

  // Hit-stop (SPEC §6): o mundo congela por um instante no acerto, mas a
  // simulação do jogador continua, para o controle nunca travar.
  const dtAnim = efeitos.congelado(now) ? 0 : dt;

  const look = input.readLook();
  follow.orbit(look.yaw, look.pitch);
  follow.zoom(look.zoom);

  const axes = input.readAxes();
  const andar = moveDirectionFromCamera(axes.forward, axes.strafe, follow.yaw);
  // Até o impacto o golpe empurra o personagem para a frente (o rumo da câmera),
  // somado ao que o jogador já está andando; a física limita ao máximo de corrida.
  const direction = { x: andar.x, z: andar.z };
  if (golpeAtual && now < golpeInicio + impactoDoGolpe(golpeAtual) * 1000) {
    const avanco = AVANCO_DO_GOLPE[golpeAtual];
    direction.x += Math.sin(follow.yaw) * avanco;
    direction.z += Math.cos(follow.yaw) * avanco;
  }
  let jump = input.consumeJump();
  let dodge = input.consumeDodge();
  const interagir = input.consumeInteract();

  // Inventário: I abre e fecha; com ele aberto, 1 a 9 usam as primeiras casas.
  if (input.consumeInventory() && inventario.alternar()) {
    // O cursor precisa voltar para dar para clicar nos itens.
    document.exitPointerLock();
  }
  if (inventario.aberto) {
    for (let casa = 0; casa < 9; casa += 1) {
      if (input.consumeKey(`Digit${casa + 1}`)) inventario.usarCasa(casa);
    }
  }
  const lento = now < lentoAte;
  gosmaEl.style.opacity = lento ? '1' : '0';
  const solto = input.consumeAttack();

  // Passo fixo: a simulação do cliente é igual à que o servidor valida.
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

  // O golpe sai para onde a câmera olha: é para lá que o jogador está mirando.
  if (solto) atacar(solto, now);
  // Chegou o instante do impacto: o servidor é avisado e o rastro aparece.
  if (golpePendente && now >= golpePendente.enviarEm) {
    const { golpe } = golpePendente;
    golpePendente = null;
    if (connection) {
      connection.attack({ golpe, yaw: follow.yaw });
      rastros.golpe(golpe, player.x, player.y, player.z, follow.yaw);
      // O carregado cai com força no chão: a câmera sente.
      if (golpe === 'charged') efeitos.tremer(0.18, 0.28);
    }
  }
  const batendo = golpeAtual !== null && now < golpeAte;
  if (!batendo) golpeAtual = null;

  // Alvo da tecla F: o mais perto dentro do raio, que ainda esteja no mundo.
  const perto = nearestSpot(player.x, player.y, player.z);
  alvo = perto && spots.estaVisivel(perto.id) ? perto : undefined;

  if (interagir) {
    // Com fala aberta, F passa a caixa; senão, interage com o alvo.
    if (dialogo.aberta) {
      dialogo.avancar();
    } else if (alvo && connection) {
      connection.interact(alvo.id);
      if (alvo.tipo === 'objeto' || alvo.tipo === 'coletavel') spots.esconder(alvo.id);
    }
  }

  // O que o boneco faz na tela, por prioridade: machucado, esquiva, golpe e,
  // por fim, o que a física diz.
  let estadoVisual: CharacterState = player.state;
  if (now < machucadoAte) estadoVisual = 'hurt';
  else if (player.state === 'dodge') estadoVisual = 'dodge';
  else if (golpeAtual) estadoVisual = golpeAtual;
  const yawVisual = batendo && golpeAtual ? follow.yaw : player.yaw;

  if (connection) {
    sendTimer += dt * 1000;
    if (sendTimer >= MOVE_SEND_MS) {
      // Guarda o resto para o envio manter os 20 Hz, e não cair para 15.
      sendTimer = Math.min(sendTimer - MOVE_SEND_MS, MOVE_SEND_MS);
      // O estado e o rumo vão como o jogador os vê, para os outros também
      // verem o golpe.
      connection.sendMove({ ...local.toMovePayload(), state: estadoVisual, yaw: yawVisual });
    }
  }

  // Inimigo alerta à frente fica escondido atrás do corpo do jogador, porque a
  // câmera está atrás dele. Fadar o boneco deixa o bicho aparecer.
  const escondendo = enemies.alertaNaFrente(player.x, player.z, follow.yaw, 4);
  opacidadeLocal += ((escondendo ? 0.35 : 1) - opacidadeLocal) * Math.min(dt * 10, 1);
  localAvatar.setOpacidade(opacidadeLocal);

  localAvatar.place(player.x, player.y, player.z, yawVisual);
  localAvatar.animate(estadoVisual, dtAnim, golpeAnimado !== golpeGatilho);
  golpeAnimado = golpeGatilho;

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

  // Barra de carga do golpe carregado: só aparece depois de segurar um pouco.
  const carga = input.chargeProgress();
  const carregando = carga !== null && carga > 0.15;
  cargaEl.hidden = !carregando;
  if (carregando && carga !== null) {
    cargaBarraEl.style.width = `${Math.round(carga * 100)}%`;
    cargaEl.classList.toggle('pronta', carga >= 1);
  }

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
  // O contador é do quadro que acabou de sair; aparece no HUD do próximo.
  desenhos = renderer.info.render.calls;
});
