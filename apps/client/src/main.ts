import * as THREE from 'three';
import {
  ARENA_COLLIDERS,
  colisoresPara,
  type Box,
  ARENA_SPAWN,
  PLUNGE_MIN_HEIGHT,
  CLIENT_STEP_MS,
  MOVE_SEND_MS,
  PredictedPlayer,
  SnapshotBuffer,
  alturaAcimaDoChao,
  duracaoDoGolpe,
  impactoDoGolpe,
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
import { carregarModelos, modeloDoJogador } from './models.js';
import {
  joinIsland,
  simulatedLagMs,
  type IslandConnection,
  type NetEnemy,
  type NetPlayer,
  type NetTree,
} from './network.js';
import { CASAS_DA_BARRA, Hotbar } from './hotbar.js';
import { PauseMenu } from './menu.js';
import { createStage } from './scene.js';
import { carregarConfiguracoes, pixelRatioDa, type Configuracoes } from './settings.js';
import { MODELOS_DAS_ARVORES } from './trees.js';
import { criarCenario, carregarModelosDoCenario, modelosDoMapa } from './cenario.js';
import { criarMar } from './mar.js';
import { Avisos } from './avisos.js';
import { BarraDoChefe } from './barraDoChefe.js';
import { Caverna } from './caverna.js';
import { Moedas } from './moedas.js';
import { Painel, type TipoDePainel } from './painel.js';
import { Portoes } from './portoes.js';
import { Spots } from './spots.js';
import { Trees } from './trees.js';
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
    coracoes: byId('coracoes'),
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

const painel = new Painel(byId('painel'), {
  comprar: (item) => {
    connection?.buy(item);
  },
  fabricar: (receita) => {
    connection?.craft(receita);
  },
});
/** Painel que chegou enquanto a fala ainda estava aberta: abre quando ela fechar. */
let painelPendente: TipoDePainel | null = null;

/** Objetos de missão que somem depois de usados (a bancada e a porta ficam). */
const SOMEM_AO_USAR: ReadonlySet<string> = new Set([
  'caixa_quebravel',
  'lanterna_pantano',
  'comporta',
  'caracois_parasitas',
]);

const inventario = new InventoryPanel(
  byId('inventario'),
  byId('inventario-abas'),
  byId('inventario-grade'),
  byId('inventario-detalhe'),
  (itemId) => {
    connection?.useItem(itemId);
  },
  (itemId) => {
    connection?.equip(itemId);
  },
);

const atalhos = new Hotbar(byId('atalhos'), (itemId) => {
  connection?.useItem(itemId);
});

const { scene, camera, renderer } = createStage(canvas);

let config = carregarConfiguracoes();
const debugEl = byId('debug');
function aplicarConfiguracoes(nova: Configuracoes): void {
  config = nova;
  input.configurar(nova);
  debugEl.hidden = !nova.mostrarDebug;
  renderer.setPixelRatio(pixelRatioDa(nova.qualidade, window.devicePixelRatio));
}

/**
 * O navegador solta o mouse capturado no Esc, e aí o menu abre. Quando quem
 * solta é o próprio jogo (abrir o inventário), o menu não deve abrir.
 */
let soltandoDePropósito = false;
let soltouEm = 0;
function soltarPonteiro(): void {
  if (document.pointerLockElement !== canvas) return;
  soltandoDePropósito = true;
  document.exitPointerLock();
}
function capturarPonteiro(): void {
  // Logo depois de um Esc o navegador recusa capturar de novo; o próximo clique
  // no jogo captura.
  canvas.requestPointerLock()?.catch(() => undefined);
}

const menu = new PauseMenu(byId('menu'), config, aplicarConfiguracoes, () => {
  menu.fechar();
  capturarPonteiro();
});

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) return;
  soltouEm = performance.now();
  if (soltandoDePropósito) {
    soltandoDePropósito = false;
    return;
  }
  if (!inventario.aberto && !painel.aberto) menu.abrir();
});

window.addEventListener('keydown', (event) => {
  if (event.code !== 'Escape' || event.repeat) return;
  // O mesmo Esc que soltou o mouse já abriu o menu; não fecha de novo.
  if (performance.now() - soltouEm < 300) return;
  if (painel.aberto) {
    painel.fechar();
  } else if (menu.aberto) {
    menu.fechar();
    capturarPonteiro();
  } else if (inventario.aberto) {
    inventario.alternar();
  } else {
    menu.abrir();
  }
});
scene.add(createArena());
const mar = criarMar();
scene.add(mar.malha);

hud.setStatus(ui.loading);
try {
  await carregarModelosDoCenario([...modelosDoMapa(), ...MODELOS_DAS_ARVORES]);
  scene.add(criarCenario());
} catch (erro) {
  console.error('cenário não carregou, ficam as caixas', erro);
}
try {
  await carregarModelos();
} catch (erro) {
  console.error('modelos não carregaram, usando bonecos de primitiva', erro);
}

const spots = new Spots();
scene.add(spots.group);

const enemies = new Enemies();
scene.add(enemies.group);

const arvores = new Trees();
scene.add(arvores.group);

const rastros = new Rastros();
scene.add(rastros.group);

const input = new InputReader(canvas);
aplicarConfiguracoes(config);
const follow = new ThirdPersonCamera(camera, ARENA_SPAWN.yaw);

/** Colisores do jogador: o mundo e os portões das zonas ainda fechadas. */
const colisores: Box[] = colisoresPara(new Set());
const caverna = new Caverna();
caverna.definirAbertas(new Set());
scene.add(caverna.group);
const barraDoChefe = new BarraDoChefe(byId('chefe'));
const tintaEl = byId('tinta');
let tintaAte = 0;
const avisos = new Avisos();
scene.add(avisos.group);
const moedas = new Moedas();
scene.add(moedas.group);
const portoes = new Portoes();
portoes.definirAbertas(new Set());
scene.add(portoes.group);

const local = new PredictedPlayer(
  spawnPhysics(ARENA_SPAWN.x, ARENA_SPAWN.y, ARENA_SPAWN.z, ARENA_SPAWN.yaw),
  colisores,
);
const localAvatar = new Avatar({ modelo: modeloDoJogador(0), cor: playerColor(0) });
scene.add(localAvatar.root);

interface RemoteAvatar {
  readonly avatar: Avatar;
  readonly buffer: SnapshotBuffer;
  /** Onde estava no quadro anterior, para saber se está andando. */
  ultimoX: number;
  ultimoY: number;
  ultimoZ: number;
}

/** Golpes que o tronco dá enquanto as pernas fazem outra coisa. */
const GOLPES_DE_TRONCO: ReadonlySet<CharacterState> = new Set<CharacterState>([
  'attack1',
  'attack2',
  'attack3',
  'charged',
]);
/** O que as pernas podem fazer durante um golpe: correr, subir e cair. */
const PERNAS_EM_MOVIMENTO: ReadonlySet<CharacterState> = new Set<CharacterState>([
  'run',
  'jump',
  'fall',
]);

/**
 * Golpe dado andando ou no ar: as pernas seguem o corpo em vez de travar na
 * pose do golpe, que fazia o personagem deslizar pelo chão. Parado, `undefined`:
 * o golpe toca no corpo todo, com o passo de apoio das pernas.
 */
function pernasDoGolpe(estado: CharacterState, corpo: CharacterState): CharacterState | undefined {
  return GOLPES_DE_TRONCO.has(estado) && PERNAS_EM_MOVIMENTO.has(corpo) ? corpo : undefined;
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
/** Ataque no ar: o personagem despenca com a espada até o chão. */
let mergulhando = false;
let mergulhoDesde = 0;
/** Trava de segurança: nenhum mergulho dura mais que isto. */
const MERGULHO_MAX_MS = 3000;

const AVANCO_DO_GOLPE: Readonly<Record<AttackKind, number>> = {
  attack1: 0.35,
  attack2: 0.3,
  attack3: 0.5,
  charged: 0.25,
  plunge: 0,
};

let golpeAnimado = 0;
let ultimoGolpe: AttackKind | null = null;
let ultimoGolpeEm = 0;
/**
 * Pulo e esquiva ficam guardados até um passo de física os aplicar. O teclado é
 * lido a cada quadro, mas o passo fixo de 60 Hz não roda em todo quadro: num
 * monitor de 144 Hz, só um quadro em cada dois ou três roda um passo, e o pulo
 * lido nos outros se perdia. Era o "às vezes pula, às vezes não".
 */
let puloPendente = false;
let esquivaPendente = false;
let machucadoAte = 0;
let opacidadeLocal = 1;

function onPatch(
  players: readonly NetPlayer[],
  inimigos: readonly NetEnemy[],
  arvoresDaSala: readonly NetTree[],
  arrivedAt: number,
): void {
  const present = new Set<string>();
  enemies.sync(inimigos, arrivedAt);
  arvores.sync(arvoresDaSala);

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
      remote = {
        avatar,
        buffer: new SnapshotBuffer(),
        ultimoX: player.x,
        ultimoY: player.y,
        ultimoZ: player.z,
      };
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
    painel.atualizar(inventory);
    inventario.atualizar(inventory.itens, inventory.armaEquipada);
    atalhos.atualizar(inventory.itens);
    localAvatar.equipar(inventory.armaEquipada);
  },
  onRespawn: (volta) => {
    local.teleport(volta.x, volta.y, volta.z, volta.yaw);
    follow.yaw = volta.yaw;
    golpePendente = null;
    golpeAtual = null;
    golpesNaFila = 0;
    carregarNaFila = false;
    puloPendente = false;
    esquivaPendente = false;
    mergulhando = false;
    machucadoAte = 0;
    lentoAte = 0;
    efeitos.piscarVermelho(performance.now(), 600);
    mostrarNotice(ui.caiu);
  },
  onStatus: (status) => {
    if (status.tipo === 'lento') lentoAte = performance.now() + status.segundos * 1000;
    if (status.tipo === 'tinta') tintaAte = performance.now() + status.segundos * 1000;
  },
  onNotice: (notice) => {
    mostrarNotice(ui.avisos[notice.codigo]);
  },
  onLoot: (loot) => {
    hud.mostrarLoot(loot);
    if (alvo?.tipo === 'bau') spots.esconder(alvo.id);
  },
  onPanel: (tipo) => {
    if (dialogo.aberta) {
      painelPendente = tipo;
    } else {
      painel.abrir(tipo);
      soltarPonteiro();
    }
  },
  onBoss: (luta) => {
    barraDoChefe.atualizar(luta);
    caverna.aoReceberLuta(luta);
  },
  onTelegraph: (aviso) => {
    avisos.mostrar(aviso);
  },
  onCoin: (id) => {
    moedas.pegar(id);
  },
  onZones: (zonas) => {
    const abertas = new Set(zonas);
    colisores.length = 0;
    colisores.push(...colisoresPara(abertas));
    portoes.definirAbertas(abertas);
    caverna.definirAbertas(abertas);
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

/**
 * Instantes, em segundos depois do começo do carregado, em que a lâmina passa nos
 * dois primeiros cortes do combo (o terceiro é o impacto). Medidos no clipe
 * Sword_Regular_Combo, 0,25 s e 0,73 s, na velocidade em que ele toca.
 */
const MOMENTOS_DA_RAJADA: readonly number[] = [0.14, 0.4];
/** Quantos cortes da rajada já ganharam rastro neste carregado. */
let rajadaFeita = 0;

/** Começa o ataque no ar: o personagem despenca com a espada para baixo. */
function iniciarMergulho(agora: number): void {
  mergulhando = true;
  mergulhoDesde = agora;
  golpePendente = null;
  golpeAtual = 'plunge';
  golpeInicio = agora;
  golpeAte = Number.POSITIVE_INFINITY;
  yawDoGolpe = local.current.yaw;
  golpeGatilho += 1;
}

/** Pousou (ou estourou o tempo): bate no chão, em área, e o servidor decide o dano. */
function aterrissar(agora: number): void {
  mergulhando = false;
  golpeAte = agora + duracaoDoGolpe('plunge') * 1000;
  golpeLiberadoEm = agora + recargaDoGolpeMs('plunge') + 20;
  ultimoGolpe = 'plunge';
  ultimoGolpeEm = agora;

  const p = local.current;
  if (!p.onGround) return;
  connection?.attack({ golpe: 'plunge', yaw: yawDoGolpe });
  rastros.golpe('plunge', p.x, p.y, p.z, yawDoGolpe);
  efeitos.tremer(0.22, 0.3);
}

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
  rajadaFeita = 0;
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

  // Com o menu aberto o jogo não lê teclado nem mouse: o mundo segue, o
  // personagem fica parado.
  if (menu.aberto || painel.aberto) {
    input.soltarTudo();
    puloPendente = false;
    esquivaPendente = false;
    direction.x = 0;
    direction.z = 0;
  }

  if (input.consumeJump()) puloPendente = true;
  if (input.consumeDodge()) esquivaPendente = true;
  const interagir = input.consumeInteract();

  if (input.consumeInventory() && inventario.alternar()) {
    // O cursor precisa voltar para dar para clicar nos itens.
    soltarPonteiro();
  }
  for (let casa = 0; casa < CASAS_DA_BARRA; casa += 1) {
    if (input.consumeKey(`Digit${casa + 1}`)) atalhos.usar(casa);
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
      jump: puloPendente,
      dodge: esquivaPendente,
      speedScale: lento ? ESCALA_LENTA : 1,
      plunge: mergulhando,
    });
    accumulator -= STEP_SECONDS;
    puloPendente = false;
    esquivaPendente = false;
  }

  const player = local.current;

  if (mergulhando && (player.onGround || now - mergulhoDesde > MERGULHO_MAX_MS)) aterrissar(now);

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
  if (mergulhando) {
    golpesNaFila = 0;
    carregarNaFila = false;
  }
  // Só mergulha quem está alto: num pulo comum o clique segue sendo o combo.
  const alto =
    !player.onGround &&
    alturaAcimaDoChao(player.x, player.y, player.z, ARENA_COLLIDERS) >= PLUNGE_MIN_HEIGHT;
  if (!mergulhando && alto && now >= golpeLiberadoEm && (golpesNaFila > 0 || carregarNaFila)) {
    // Clicou com o personagem no ar: em vez do combo, o mergulho.
    golpesNaFila = 0;
    carregarNaFila = false;
    iniciarMergulho(now);
  } else if (!mergulhando && now >= golpeLiberadoEm && golpePendente === null) {
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
      if (!dialogo.avancar() && painelPendente) {
        painel.abrir(painelPendente);
        painelPendente = null;
        soltarPonteiro();
      }
    } else if (alvo && connection) {
      connection.interact(alvo.id);
      if (SOMEM_AO_USAR.has(alvo.alvo) || alvo.tipo === 'coletavel') spots.esconder(alvo.id);
    }
  }

  let estadoVisual: CharacterState = player.state;
  const gatilhoVisual = golpeGatilho;

  if (now < machucadoAte) {
    estadoVisual = 'hurt';
  } else if (player.state === 'dodge') {
    estadoVisual = 'dodge';
  } else if (golpeAtual) {
    estadoVisual = golpeAtual;
  }

  // O carregado toca o combo de espada de uma vez só; os dois primeiros cortes
  // ganham o rastro na hora em que a lâmina passa, e o terceiro sai no impacto.
  if (golpeAtual === 'charged') {
    const decorrido = (now - golpeInicio) / 1000;
    let momento = MOMENTOS_DA_RAJADA[rajadaFeita];
    while (momento !== undefined && decorrido >= momento) {
      const corte = rajadaFeita === 0 ? 'attack1' : 'attack2';
      rastros.golpe(corte, player.x, player.y, player.z, yawDoGolpe);
      rajadaFeita += 1;
      momento = MOMENTOS_DA_RAJADA[rajadaFeita];
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
  localAvatar.animate(
    estadoVisual,
    dtAnim,
    golpeAnimado !== gatilhoVisual,
    mergulhando,
    pernasDoGolpe(estadoVisual, player.state),
  );
  golpeAnimado = gatilhoVisual;

  follow.update(player.x, player.y, player.z, colisores, dt);
  efeitos.tremerCamera(camera, dt);
  spots.update(dtAnim, player, alvo);
  enemies.update(now, dtAnim);
  arvores.update(dtAnim);
  moedas.update(dtAnim);
  avisos.update(dtAnim);
  caverna.update(dtAnim);
  tintaEl.style.opacity = performance.now() < tintaAte ? '1' : '0';
  rastros.update(dtAnim);

  for (const remote of remotes.values()) {
    const pose = remote.buffer.sample(now);
    if (!pose) continue;
    remote.avatar.place(pose.x, pose.y, pose.z, pose.yaw);
    // Do outro jogador só chega a pose; se ele andou desde o último quadro, as
    // pernas correm enquanto ele golpeia.
    const andou = Math.hypot(pose.x - remote.ultimoX, pose.z - remote.ultimoZ) > 0.01;
    // Em mergulho, ele ainda está no ar enquanto a altura diminui.
    const descendo = pose.y < remote.ultimoY - 0.005;
    remote.ultimoX = pose.x;
    remote.ultimoY = pose.y;
    remote.ultimoZ = pose.z;
    remote.avatar.animate(
      pose.state,
      dtAnim,
      false,
      pose.state === 'plunge' && descendo,
      pernasDoGolpe(pose.state, andou ? 'run' : 'idle'),
    );
  }

  cargaEl.hidden = true;

  efeitos.update(dt, now, camera, canvas);
  mar.update(now / 1000);

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
