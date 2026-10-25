import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { DODGE_DURATION, PLAYER_HEIGHT, impactoDoGolpe, type CharacterState } from '@islabr/shared';

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

/**
 * Modelo de cada arma, pelo id do item. O graveto ainda não tem modelo próprio
 * (não há graveto nos assets CC0), então aparece como uma adaga curta.
 */
const MODELO_DA_ARMA: Readonly<Record<string, string>> = {
  graveto_reforcado: 'dagger',
  arma_nv2: 'sword_1handed',
};

const armas = new Map<string, THREE.Group>();

const ANIM_LIBRARIES = [
  'Rig_Medium_General',
  'Rig_Medium_MovementBasic',
  'Rig_Medium_MovementAdvanced',
  'Rig_Medium_CombatMelee',
];

/**
 * Clipe do KayKit para cada estado da máquina (SPEC §6). O primeiro da lista
 * que existir é o usado; os seguintes são reserva.
 */
const CLIP_BY_STATE: Readonly<Record<CharacterState, readonly string[]>> = {
  idle: ['Idle_A', 'Idle_B'],
  run: ['Running_A', 'Running_B', 'Walking_A'],
  jump: ['Jump_Start', 'Jump_Idle'],
  fall: ['Jump_Idle', 'Jump_Start'],
  dodge: ['Dodge_Forward', 'Running_A'],
  hurt: ['Hit_A', 'Hit_B'],
  dead: ['Death_A', 'Death_B'],
  // Combo: corte diagonal, varrida horizontal e golpe de cima para fechar.
  attack1: ['Melee_1H_Attack_Slice_Diagonal', 'Idle_A'],
  attack2: ['Melee_1H_Attack_Slice_Horizontal', 'Idle_A'],
  attack3: ['Melee_1H_Attack_Chop', 'Idle_A'],
  // O carregado não toca clipe próprio: o main troca entre os três golpes normais
  // em sequência rápida (rajada). Este é só o reserva, para o mapa ficar completo.
  charged: ['Melee_1H_Attack_Chop', 'Idle_A'],
  // Mergulho: o golpe de cima com salto, segurado no alto durante a descida.
  plunge: ['Melee_1H_Attack_Jump_Chop', 'Melee_1H_Attack_Chop', 'Idle_A'],
};

/**
 * Instante do clipe do mergulho em que o personagem fica parado no ar, com a
 * espada erguida, até pousar. Daí o clipe segue e a lâmina desce no chão. Se a
 * pose não parecer a certa, é este número que se mexe.
 */
export const POSE_DO_MERGULHO_S = 0.55;

/**
 * Em que instante do clipe a lâmina acerta, em segundos. Medido nos próprios
 * clipes do KayKit, pelo instante de maior velocidade do braço direito.
 *
 * A velocidade de cada golpe é calculada para esse instante cair no impacto do
 * jogo (`impactoDoGolpe`), e não para o clipe inteiro caber no golpe. O clipe
 * inteiro espremido virava um tranco sem preparação, e o dano saía antes de a
 * espada chegar. O fim do clipe (a volta à posição de descanso) é cortado pela
 * mudança de estado, então o golpe termina quando o jogo diz que terminou.
 */
const IMPACTO_NO_CLIPE: Readonly<Partial<Record<CharacterState, number>>> = {
  attack1: 0.42,
  attack2: 0.28,
  attack3: 0.62,
  charged: 0.62,
};

/** Quanto a esquiva deve durar na tela: esta, sim, cabe inteira. */
const DURACAO_DO_ESTADO: Readonly<Partial<Record<CharacterState, number>>> = {
  dodge: DODGE_DURATION,
};

/** Velocidade de reprodução de um golpe, para o impacto do clipe cair no do jogo. */
function velocidadeDoGolpe(estado: CharacterState): number | undefined {
  const noClipe = IMPACTO_NO_CLIPE[estado];
  if (noClipe === undefined) return undefined;
  if (
    estado !== 'attack1' &&
    estado !== 'attack2' &&
    estado !== 'attack3' &&
    estado !== 'charged'
  ) {
    return undefined;
  }
  return noClipe / impactoDoGolpe(estado);
}

/** Estados que tocam uma vez e seguram a última pose. */
const ONCE: ReadonlySet<CharacterState> = new Set<CharacterState>([
  'jump',
  'hurt',
  'dead',
  'attack1',
  'attack2',
  'attack3',
  'charged',
  'plunge',
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

  // As armas são glTF soltos (um arquivo .gltf, um .bin e a textura).
  await Promise.all(
    Object.entries(MODELO_DA_ARMA).map(async ([item, arquivo]) => {
      const gltf = await loader.loadAsync(`${base()}/${arquivo}.gltf`);
      armas.set(item, gltf.scene);
    }),
  );

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

/** Cópia do modelo da arma, ou `null` se o item não tem modelo. */
export function criarArma(itemId: string): THREE.Object3D | null {
  return armas.get(itemId)?.clone(true) ?? null;
}

export function temModelo(nome: string): boolean {
  return templates.has(nome);
}

export interface ModeloAnimado {
  readonly raiz: THREE.Object3D;
  /**
   * Troca o clipe com mistura de 0,1–0,2 s (SPEC §6). Com `reiniciar`, o mesmo
   * estado toca do começo: dois golpes iguais seguidos precisam de dois swings.
   */
  tocar(estado: CharacterState, mistura: number, reiniciar?: boolean): void;
  /** Com `segurarEm`, o clipe em curso não passa desse instante, em segundos. */
  avancar(dt: number, segurarEm?: number): void;
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
      const duracao = DURACAO_DO_ESTADO[estado];
      const velocidade = velocidadeDoGolpe(estado);
      if (velocidade !== undefined) {
        acao.setEffectiveTimeScale(velocidade);
      } else if (duracao !== undefined && clip.duration > 0) {
        acao.setEffectiveTimeScale(clip.duration / duracao);
      }
      acoes.set(estado, acao);
      return acao;
    }
    return null;
  };

  return {
    raiz,
    tocar(estado, mistura, reiniciar = false) {
      if (estado === estadoAtual && !reiniciar) return;
      const proxima = acaoDe(estado);
      if (!proxima) return;
      estadoAtual = estado;
      proxima.reset().play();
      if (atual && atual !== proxima) proxima.crossFadeFrom(atual, mistura, false);
      atual = proxima;
    },
    avancar(dt, segurarEm) {
      mixer.update(dt);
      if (segurarEm !== undefined && atual && atual.time > segurarEm) atual.time = segurarEm;
    },
    descartar() {
      mixer.stopAllAction();
      mixer.uncacheRoot(raiz);
    },
  };
}
