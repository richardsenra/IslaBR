import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PLAYER_HEIGHT, type CharacterState } from '@islabr/shared';

/**
 * Modelos glTF dos personagens (KayKit, CC0 — ver public/models/LICENSE.md).
 *
 * Os seis personagens compartilham um esqueleto de 23 ossos com as bibliotecas
 * de animação, então os clipes tocam em qualquer um deles sem retarget. Aqui
 * eles são carregados uma vez e clonados por boneco.
 */

export const PLAYER_MODELS = [
  'Rogue',
  'Ranger',
  'Knight',
  'Mage',
  'Barbarian',
  'Rogue_Hooded',
] as const;

export type ModelName = (typeof PLAYER_MODELS)[number];

/** Modelo de cada jogador na sala, para dois bonecos nunca saírem iguais. */
export function modeloDoJogador(colorIndex: number): ModelName {
  const indice =
    ((colorIndex % PLAYER_MODELS.length) + PLAYER_MODELS.length) % PLAYER_MODELS.length;
  return PLAYER_MODELS[indice] ?? 'Rogue';
}

/** Modelo de cada NPC. Provisório, como o resto da arena. */
export const NPC_MODELS: Readonly<Record<string, ModelName>> = {
  npc_nara: 'Ranger',
  npc_bento: 'Barbarian',
  npc_iracema: 'Mage',
  npc_calango: 'Rogue_Hooded',
  npc_tito: 'Rogue',
  npc_anselmo: 'Knight',
};

const ANIM_LIBRARIES = [
  'Rig_Medium_General',
  'Rig_Medium_MovementBasic',
  'Rig_Medium_MovementAdvanced',
];

/**
 * Clipe do KayKit para cada estado da máquina (SPEC §6). Os de ataque estão em
 * `Rig_Medium_CombatMelee`, que só entra no M3; até lá eles caem no reserva.
 */
const CLIP_BY_STATE: Readonly<Record<CharacterState, readonly string[]>> = {
  idle: ['Idle_A', 'Idle_B'],
  run: ['Running_A', 'Running_B', 'Walking_A'],
  jump: ['Jump_Start', 'Jump_Idle'],
  fall: ['Jump_Idle', 'Jump_Start'],
  dodge: ['Dodge_Forward', 'Running_A'],
  hurt: ['Hit_A', 'Hit_B'],
  dead: ['Death_A', 'Death_B'],
  attack1: ['Melee_1H_Attack_Chop', 'Idle_A'],
  attack2: ['Melee_1H_Attack_Slice_Horizontal', 'Idle_A'],
  attack3: ['Melee_1H_Attack_Slice_Diagonal', 'Idle_A'],
  charged: ['Melee_2H_Attack_Spinning', 'Idle_A'],
};

/** Estados que tocam uma vez e seguram a última pose. */
const ONCE: ReadonlySet<CharacterState> = new Set<CharacterState>([
  'jump',
  'hurt',
  'dead',
  'attack1',
  'attack2',
  'attack3',
  'charged',
]);

const loader = new GLTFLoader();
const templates = new Map<string, THREE.Group>();
const clips = new Map<string, THREE.AnimationClip>();

function base(): string {
  return `${import.meta.env.BASE_URL}models`;
}

async function carregar(nome: string): Promise<{
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}> {
  const gltf = await loader.loadAsync(`${base()}/${nome}.glb`);
  return { scene: gltf.scene, animations: gltf.animations };
}

/**
 * Carrega personagens e bibliotecas de animação. Chamar antes do primeiro
 * quadro; se falhar, o jogo segue com o boneco de primitivas.
 */
export async function carregarModelos(nomes: readonly string[]): Promise<void> {
  const bibliotecas = await Promise.all(ANIM_LIBRARIES.map((nome) => carregar(nome)));
  for (const biblioteca of bibliotecas) {
    for (const clip of biblioteca.animations) {
      if (!clips.has(clip.name)) clips.set(clip.name, clip);
    }
  }

  const personagens = await Promise.all(
    nomes.map(async (nome) => [nome, await carregar(nome)] as const),
  );
  for (const [nome, gltf] of personagens) {
    const raiz = gltf.scene;
    // O modelo vem com ~2,2 unidades de altura; o corpo do jogo tem 1,7 m.
    const caixa = new THREE.Box3().setFromObject(raiz);
    const altura = caixa.max.y - caixa.min.y;

    if (altura > 0) raiz.scale.setScalar(PLAYER_HEIGHT / altura);
    templates.set(nome, raiz);
  }
}

export function temModelo(nome: string): boolean {
  return templates.has(nome);
}

export interface ModeloAnimado {
  readonly raiz: THREE.Object3D;
  /** Troca o clipe com mistura de 0,1–0,2 s (SPEC §6). */
  tocar(estado: CharacterState, mistura: number): void;
  avancar(dt: number): void;
  descartar(): void;
}

export function criarModelo(nome: string): ModeloAnimado | null {
  const template = templates.get(nome);
  if (!template) return null;

  const raiz = cloneSkinned(template);
  const mixer = new THREE.AnimationMixer(raiz);
  const acoes = new Map<CharacterState, THREE.AnimationAction>();
  let atual: THREE.AnimationAction | null = null;
  let estadoAtual: CharacterState | null = null;

  const acaoDe = (estado: CharacterState): THREE.AnimationAction | null => {
    const pronta = acoes.get(estado);
    if (pronta) return pronta;
    for (const nomeClipe of CLIP_BY_STATE[estado]) {
      const clip = clips.get(nomeClipe);
      if (!clip) continue;
      const acao = mixer.clipAction(clip, raiz);
      if (ONCE.has(estado)) {
        acao.setLoop(THREE.LoopOnce, 1);
        acao.clampWhenFinished = true;
      }
      acoes.set(estado, acao);
      return acao;
    }
    return null;
  };

  return {
    raiz,
    tocar(estado, mistura) {
      if (estado === estadoAtual) return;
      const proxima = acaoDe(estado);
      if (!proxima) return;
      estadoAtual = estado;
      proxima.reset().play();
      if (atual && atual !== proxima) proxima.crossFadeFrom(atual, mistura, false);
      atual = proxima;
    },
    avancar(dt) {
      mixer.update(dt);
    },
    descartar() {
      mixer.stopAllAction();
      mixer.uncacheRoot(raiz);
    },
  };
}
