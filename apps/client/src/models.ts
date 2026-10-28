import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  DODGE_DURATION,
  PLAYER_HEIGHT,
  impactoDoGolpe,
  type AttackState,
  type CharacterState,
} from '@islabr/shared';

/**
 * Modelos glTF dos personagens, de dois pacotes CC0 (ver public/models/LICENSE*).
 *
 * - Jogadores: Superhero, da Quaternius, com as animações da Universal Animation
 *   Library (UAL). Esqueleto de 65 ossos.
 * - NPCs: KayKit, com as bibliotecas de animação do KayKit. Esqueleto de 23 ossos.
 *
 * Os esqueletos são outros, então cada pacote tem o seu descritor de animação
 * (`RIGS`): clipes de cada estado, instante do impacto, velocidades e onde a
 * arma encaixa. Dentro de um pacote, os clipes tocam em qualquer personagem sem
 * retarget. Os modelos são carregados uma vez e clonados por boneco.
 */

type Rig = 'ual' | 'kaykit';

export const PLAYER_MODELS = ['Superhero_Male', 'Superhero_Female'] as const;

const NPC_MODEL_NAMES = ['Rogue', 'Ranger', 'Knight', 'Mage', 'Barbarian', 'Rogue_Hooded'] as const;

export type ModelName = (typeof PLAYER_MODELS)[number] | (typeof NPC_MODEL_NAMES)[number];

/** Modelo de cada jogador na sala, para dois bonecos vizinhos não saírem iguais. */
export function modeloDoJogador(colorIndex: number): ModelName {
  const indice =
    ((colorIndex % PLAYER_MODELS.length) + PLAYER_MODELS.length) % PLAYER_MODELS.length;
  return PLAYER_MODELS[indice] ?? 'Superhero_Male';
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

const RIG_DO_MODELO: Readonly<Record<ModelName, Rig>> = {
  Superhero_Male: 'ual',
  Superhero_Female: 'ual',
  Rogue: 'kaykit',
  Ranger: 'kaykit',
  Knight: 'kaykit',
  Mage: 'kaykit',
  Barbarian: 'kaykit',
  Rogue_Hooded: 'kaykit',
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

/** Onde e como a arma encaixa na mão de um esqueleto. */
export interface EncaixeDaArma {
  /** Nome do osso, como fica depois de o carregador tirar os pontos. */
  readonly osso: string;
  readonly posicao: readonly [number, number, number];
  readonly giro: readonly [number, number, number];
  readonly escala: number;
}

interface DescritorDoRig {
  /** Arquivos em `public/models` com as animações do pacote. */
  readonly bibliotecas: readonly string[];
  /**
   * Clipe de cada estado da máquina (SPEC §6). O primeiro da lista que existir
   * é o usado; os seguintes são reserva.
   */
  readonly clipes: Readonly<Record<CharacterState, readonly string[]>>;
  /**
   * Em que instante do clipe a lâmina acerta, em segundos, medido pelo maior
   * pico de velocidade da mão da espada. A velocidade de cada golpe é calculada
   * para esse instante cair no impacto do jogo (`impactoDoGolpe`), e não para o
   * clipe inteiro caber no golpe: o clipe espremido virava um tranco sem
   * preparação, e o dano saía antes de a espada chegar. O fim do clipe é
   * cortado pela mudança de estado, então o golpe termina quando o jogo diz.
   */
  readonly impacto: Readonly<Partial<Record<AttackState, number>>>;
  /** Velocidade de reprodução fixa de estados que não são golpe. */
  readonly velocidade: Readonly<Partial<Record<CharacterState, number>>>;
  /**
   * Instante do clipe do mergulho em que o personagem fica parado no ar, com a
   * espada erguida, até pousar. Daí o clipe segue e a lâmina desce no chão.
   */
  readonly poseDoMergulho: number;
  /** O osso é do tronco para cima? Senão é da metade de baixo (raiz, quadril e pernas). */
  readonly ehDeCima: (osso: string) => boolean;
  readonly arma: EncaixeDaArma;
}

const RIGS: Readonly<Record<Rig, DescritorDoRig>> = {
  ual: {
    bibliotecas: ['Anim_UAL1', 'Anim_UAL2'],
    clipes: {
      idle: ['Idle_Loop'],
      run: ['Sprint_Loop', 'Jog_Fwd_Loop'],
      jump: ['Jump_Start', 'Jump_Loop'],
      fall: ['Jump_Loop', 'Jump_Start'],
      dodge: ['Roll'],
      hurt: ['Hit_Chest', 'Hit_Head'],
      dead: ['Death01'],
      // O Sword_Regular_A/B/C terminam no impacto; a volta à guarda é o _Rec, que
      // aqui o cruzamento com o idle faz.
      attack1: ['Sword_Regular_A'],
      attack2: ['Sword_Regular_B'],
      attack3: ['Sword_Regular_C'],
      // O carregado não toca clipe próprio: o main alterna entre os três golpes
      // normais em sequência rápida (rajada). Este é só o reserva.
      charged: ['Sword_Regular_C'],
      // Mergulho: o golpe de cima, segurado no alto durante a descida.
      plunge: ['Sword_Regular_C'],
    },
    impacto: { attack1: 0.25, attack2: 0.27, attack3: 0.65, charged: 0.65 },
    velocidade: { run: 1.4, jump: 1.6 },
    poseDoMergulho: 0.5,
    ehDeCima: (osso) => !/^(root|pelvis|thigh_|calf_|foot_|ball_)/.test(osso),
    // Medido na pose Sword_Idle: os dedos se dobram em torno do eixo Z do osso
    // hand_r, que é o do cabo. Rodar a espada 90° em X põe a lâmina (+Y) nele; o
    // centro do cabo fica na palma, do lado para onde os dedos fecham (-X).
    arma: {
      osso: 'hand_r',
      posicao: [-0.03, 0.08, 0.003],
      giro: [Math.PI / 2, 0, 0],
      escala: 0.82,
    },
  },
  kaykit: {
    bibliotecas: [
      'Rig_Medium_General',
      'Rig_Medium_MovementBasic',
      'Rig_Medium_MovementAdvanced',
      'Rig_Medium_CombatMelee',
    ],
    clipes: {
      idle: ['Idle_A', 'Idle_B'],
      run: ['Running_A', 'Running_B', 'Walking_A'],
      jump: ['Jump_Start', 'Jump_Idle'],
      fall: ['Jump_Idle', 'Jump_Start'],
      dodge: ['Dodge_Forward', 'Running_A'],
      hurt: ['Hit_A', 'Hit_B'],
      dead: ['Death_A', 'Death_B'],
      attack1: ['Melee_1H_Attack_Slice_Diagonal', 'Idle_A'],
      attack2: ['Melee_1H_Attack_Slice_Horizontal', 'Idle_A'],
      attack3: ['Melee_1H_Attack_Chop', 'Idle_A'],
      charged: ['Melee_1H_Attack_Chop', 'Idle_A'],
      plunge: ['Melee_1H_Attack_Jump_Chop', 'Melee_1H_Attack_Chop', 'Idle_A'],
    },
    impacto: { attack1: 0.42, attack2: 0.28, attack3: 0.62, charged: 0.62 },
    velocidade: {},
    poseDoMergulho: 0.55,
    // Nomes já sem pontos, como o carregador deixa (`handslot.r` vira `handslotr`).
    ehDeCima: (osso) =>
      [
        'spine',
        'chest',
        'head',
        'upperarml',
        'lowerarml',
        'wristl',
        'handl',
        'handslotl',
        'upperarmr',
        'lowerarmr',
        'wristr',
        'handr',
        'handslotr',
      ].includes(osso),
    arma: { osso: 'handslotr', posicao: [0, 0, 0], giro: [0, 0, 0], escala: 1 },
  },
};

/** Quanto a esquiva deve durar na tela: esta, sim, cabe inteira. */
const DURACAO_DO_ESTADO: Readonly<Partial<Record<CharacterState, number>>> = {
  dodge: DODGE_DURATION,
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
  'plunge',
]);

function ehGolpe(estado: CharacterState): estado is Exclude<AttackState, 'plunge'> {
  return (
    estado === 'attack1' || estado === 'attack2' || estado === 'attack3' || estado === 'charged'
  );
}

/** Velocidade de reprodução de um estado, ou `undefined` para a velocidade do clipe. */
function velocidadeDoEstado(rig: DescritorDoRig, estado: CharacterState): number | undefined {
  if (ehGolpe(estado)) {
    const noClipe = rig.impacto[estado];
    return noClipe === undefined ? undefined : noClipe / impactoDoGolpe(estado);
  }
  return rig.velocidade[estado];
}

const loader = new GLTFLoader();
const templates = new Map<string, THREE.Group>();
const clipsDoRig: Record<Rig, Map<string, THREE.AnimationClip>> = {
  ual: new Map(),
  kaykit: new Map(),
};

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

async function carregarRig(rig: Rig, modelos: readonly ModelName[]): Promise<void> {
  const bibliotecas = await Promise.all(RIGS[rig].bibliotecas.map((nome) => carregar(nome)));
  for (const biblioteca of bibliotecas) {
    for (const clip of biblioteca.animations) {
      if (!clipsDoRig[rig].has(clip.name)) clipsDoRig[rig].set(clip.name, clip);
    }
  }

  const personagens = await Promise.all(
    modelos.map(async (nome) => [nome, await carregar(nome)] as const),
  );
  for (const [nome, gltf] of personagens) {
    const raiz = gltf.scene;
    // O corpo do jogo tem PLAYER_HEIGHT; o modelo vem com outra altura.
    const caixa = new THREE.Box3().setFromObject(raiz);
    const altura = caixa.max.y - caixa.min.y;

    if (altura > 0) raiz.scale.setScalar(PLAYER_HEIGHT / altura);
    templates.set(nome, raiz);
  }
}

/**
 * Carrega personagens, armas e bibliotecas de animação. Chamar antes do primeiro
 * quadro. Cada pacote carrega por conta própria: se um falhar, o jogo segue com
 * o outro e com o boneco de primitivas no lugar do que faltou.
 */
export async function carregarModelos(): Promise<void> {
  // As armas são glTF soltos (um arquivo .gltf, um .bin e a textura).
  await Promise.all(
    Object.entries(MODELO_DA_ARMA).map(async ([item, arquivo]) => {
      const gltf = await loader.loadAsync(`${base()}/${arquivo}.gltf`);
      armas.set(item, gltf.scene);
    }),
  );

  const todos: readonly ModelName[] = [...PLAYER_MODELS, ...NPC_MODEL_NAMES];
  const resultados = await Promise.allSettled(
    (['ual', 'kaykit'] as const).map((rig) =>
      carregarRig(
        rig,
        todos.filter((nome) => RIG_DO_MODELO[nome] === rig),
      ),
    ),
  );
  for (const resultado of resultados) {
    if (resultado.status === 'rejected') {
      console.error(
        'um pacote de modelos não carregou; usando bonecos de primitiva',
        resultado.reason,
      );
    }
  }
}

/** Cópia do modelo da arma, ou `null` se o item não tem modelo. */
export function criarArma(itemId: string): THREE.Object3D | null {
  return armas.get(itemId)?.clone(true) ?? null;
}

export function temModelo(nome: string): boolean {
  return templates.has(nome);
}

type Metade = 'cima' | 'baixo';

const metades = new Map<string, THREE.AnimationClip>();

/**
 * O clipe só com as trilhas de uma metade do corpo. As duas metades têm a
 * duração do original, para tocarem juntas sem escorregar uma da outra.
 */
function metadeDo(rig: Rig, clip: THREE.AnimationClip, metade: Metade): THREE.AnimationClip {
  const chave = `${rig}/${clip.name}#${metade}`;
  const pronta = metades.get(chave);
  if (pronta) return pronta;
  const ehDeCima = RIGS[rig].ehDeCima;
  const trilhas = clip.tracks.filter((trilha) => {
    const osso = trilha.name.slice(0, trilha.name.lastIndexOf('.'));
    return ehDeCima(osso) === (metade === 'cima');
  });
  const nova = new THREE.AnimationClip(chave, clip.duration, trilhas);
  metades.set(chave, nova);
  return nova;
}

export interface ModeloAnimado {
  readonly raiz: THREE.Object3D;
  /** Onde a arma encaixa na mão deste esqueleto. */
  readonly encaixeDaArma: EncaixeDaArma;
  /**
   * Troca o clipe com mistura de 0,1–0,2 s (SPEC §6). Com `reiniciar`, o mesmo
   * estado toca do começo: dois golpes iguais seguidos precisam de dois swings.
   *
   * Com `pernas`, o corpo se divide: do tronco para cima toca `estado` e as
   * pernas tocam `pernas`. É o golpe dado correndo: sem isto o golpe trava as
   * pernas e o personagem desliza pelo chão.
   */
  tocar(
    estado: CharacterState,
    mistura: number,
    reiniciar?: boolean,
    pernas?: CharacterState,
  ): void;
  /** Com `segurando`, o clipe em curso para na pose do mergulho até soltar. */
  avancar(dt: number, segurando?: boolean): void;
  descartar(): void;
}

export function criarModelo(nome: string): ModeloAnimado | null {
  const template = templates.get(nome);
  if (!template) return null;

  const rig = RIG_DO_MODELO[nome as ModelName];
  const descritor = RIGS[rig];
  const clips = clipsDoRig[rig];
  const raiz = cloneSkinned(template);
  const mixer = new THREE.AnimationMixer(raiz);
  const acoes = new Map<string, THREE.AnimationAction>();

  /** Cada metade do corpo é uma camada com o seu clipe atual. */
  const camadas: Record<
    Metade,
    { acao: THREE.AnimationAction | null; estado: CharacterState | null }
  > = {
    cima: { acao: null, estado: null },
    baixo: { acao: null, estado: null },
  };

  const acaoDe = (estado: CharacterState, metade: Metade): THREE.AnimationAction | null => {
    const chave = `${estado}#${metade}`;
    const pronta = acoes.get(chave);
    if (pronta) return pronta;
    for (const nomeClipe of descritor.clipes[estado]) {
      const clip = clips.get(nomeClipe);
      if (!clip) continue;
      const acao = mixer.clipAction(metadeDo(rig, clip, metade), raiz);
      if (ONCE.has(estado)) {
        acao.setLoop(THREE.LoopOnce, 1);
        acao.clampWhenFinished = true;
      }
      const duracao = DURACAO_DO_ESTADO[estado];
      const velocidade = velocidadeDoEstado(descritor, estado);
      if (velocidade !== undefined) {
        acao.setEffectiveTimeScale(velocidade);
      } else if (duracao !== undefined && clip.duration > 0) {
        acao.setEffectiveTimeScale(clip.duration / duracao);
      }
      acoes.set(chave, acao);
      return acao;
    }
    return null;
  };

  /** Troca o clipe de uma camada; devolve a ação nova, se trocou. */
  const trocar = (
    metade: Metade,
    estado: CharacterState,
    mistura: number,
    reiniciar: boolean,
  ): THREE.AnimationAction | null => {
    const camada = camadas[metade];
    if (estado === camada.estado && !reiniciar) return null;
    const proxima = acaoDe(estado, metade);
    if (!proxima) return null;
    camada.estado = estado;
    proxima.reset().play();
    if (camada.acao && camada.acao !== proxima) proxima.crossFadeFrom(camada.acao, mistura, false);
    camada.acao = proxima;
    return proxima;
  };

  return {
    raiz,
    encaixeDaArma: descritor.arma,
    tocar(estado, mistura, reiniciar = false, pernas) {
      trocar('cima', estado, mistura, reiniciar);
      // As pernas só recomeçam junto quando fazem o mesmo golpe que o tronco;
      // correndo, recomeçar a corrida a cada golpe faria o passo engasgar.
      const nova = trocar('baixo', pernas ?? estado, mistura, reiniciar && pernas === undefined);
      // Parou de correr no meio do golpe: as pernas entram no golpe no mesmo
      // ponto em que o tronco está, e não do começo.
      const { cima } = camadas;
      if (nova && !reiniciar && pernas === undefined && cima.acao && cima.estado === estado) {
        nova.time = cima.acao.time;
      }
    },
    avancar(dt, segurando = false) {
      mixer.update(dt);
      if (!segurando) return;
      for (const camada of Object.values(camadas)) {
        if (camada.acao && camada.acao.time > descritor.poseDoMergulho) {
          camada.acao.time = descritor.poseDoMergulho;
        }
      }
    },
    descartar() {
      mixer.stopAllAction();
      mixer.uncacheRoot(raiz);
    },
  };
}
