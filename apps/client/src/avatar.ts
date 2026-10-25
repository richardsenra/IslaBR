import * as THREE from 'three';
import { STATE_BLEND_SECONDS, wrapAngle, type CharacterState } from '@islabr/shared';
import { POSE_DO_MERGULHO_S, criarArma, criarModelo, type ModeloAnimado } from './models.js';

/**
 * Boneco do jogo.
 *
 * Quando o modelo glTF está carregado (KayKit, CC0), o avatar é o modelo com
 * esqueleto e os clipes do KayKit. Se o carregamento falhar, cai no boneco de
 * primitivas com animação procedural, que foi o que existiu até o M2 — assim
 * um erro de rede não deixa o jogador invisível.
 *
 * Nos dois casos a interface é a mesma: `place` e `animate(estado, dt)`.
 */

/** Constante de tempo que dá uma transição de ~0,15 s (SPEC §6). */
const BLEND_TAU = STATE_BLEND_SECONDS / 3;

/**
 * O KayKit exporta o personagem olhando para +Z, que é a mesma convenção de
 * yaw do jogo, então não precisa girar nada. Um modelo que venha olhando para
 * -Z pediria Math.PI aqui.
 */
const MODEL_YAW_OFFSET = 0;

/**
 * Osso da mão direita no esqueleto do KayKit, onde a arma é encaixada. No
 * arquivo ele se chama `handslot.r`, mas o carregador de glTF do three.js tira
 * os pontos dos nomes dos nós (`PropertyBinding.sanitizeNodeName`), então aqui ele
 * é `handslotr`. Procurar pelo nome do arquivo não acha nada.
 */
const OSSO_DA_MAO = 'handslotr';
/** Giro da arma em relação ao osso, para a lâmina apontar para fora da mão. */
const ARMA_GIRO = { x: 0, y: 0, z: 0 };

export interface AvatarOptions {
  /** Nome do modelo em `public/models`; sem ele, usa o boneco de primitivas. */
  readonly modelo?: string;
  /** Cor do boneco de primitivas. */
  readonly cor: string;
}

export class Avatar {
  readonly root = new THREE.Group();

  private readonly modelo: ModeloAnimado | null;
  private readonly primitivo: BonecoPrimitivo | null;
  /** Materiais só deste boneco, para poder fadá-lo sem fadar os outros. */
  private readonly materiais: THREE.Material[] = [];
  private opacidade = 1;
  private armaId: string | null = null;
  private armaObjeto: THREE.Object3D | null = null;
  /** Materiais da arma na mão, separados para sair junto com ela. */
  private materiaisDaArma: THREE.Material[] = [];

  constructor(options: AvatarOptions) {
    this.modelo = options.modelo ? criarModelo(options.modelo) : null;
    if (this.modelo) {
      this.modelo.raiz.rotation.y = MODEL_YAW_OFFSET;
      this.root.add(this.modelo.raiz);
      this.primitivo = null;

      // O clone do esqueleto compartilha o material com o modelo original; sem
      // copiar, deixar um boneco transparente deixaria todos.
      this.modelo.raiz.traverse((objeto) => {
        if (!(objeto instanceof THREE.Mesh)) return;
        const copia = Array.isArray(objeto.material)
          ? objeto.material.map((material: THREE.Material) => material.clone())
          : (objeto.material as THREE.Material).clone();
        objeto.material = copia;
        this.materiais.push(...(Array.isArray(copia) ? copia : [copia]));
      });
    } else {
      this.primitivo = new BonecoPrimitivo(options.cor);
      this.root.add(this.primitivo.raiz);
    }
  }

  /**
   * Põe a arma na mão direita do boneco (o osso `handslot.r` do esqueleto do
   * KayKit), ou tira com `null`. Ela anima junto com o braço. Só vale para o
   * modelo glTF; o boneco de primitivas, que é reserva, fica de mãos vazias.
   */
  equipar(itemId: string | null): void {
    if (!this.modelo || itemId === this.armaId) return;
    this.armaId = itemId;

    if (this.armaObjeto) {
      this.armaObjeto.removeFromParent();
      this.armaObjeto = null;
    }
    for (const material of this.materiaisDaArma) {
      this.materiais.splice(this.materiais.indexOf(material), 1);
      material.dispose();
    }
    this.materiaisDaArma = [];
    if (!itemId) return;

    const mao = this.modelo.raiz.getObjectByName(OSSO_DA_MAO);
    const arma = criarArma(itemId);
    if (!mao || !arma) {
      // Não é para acontecer; se acontecer, o jogador ficaria sem arma na tela
      // sem ninguém saber por quê.
      console.warn(`arma não equipada: osso ${OSSO_DA_MAO} ou modelo de ${itemId} ausente`);
      return;
    }

    // Material próprio, para a arma também fadar junto com o dono.
    arma.traverse((objeto) => {
      if (!(objeto instanceof THREE.Mesh)) return;
      const copia = (objeto.material as THREE.Material).clone();
      copia.transparent = this.opacidade < 1;
      copia.opacity = this.opacidade;
      objeto.material = copia;
      this.materiais.push(copia);
      this.materiaisDaArma.push(copia);
    });

    arma.rotation.set(ARMA_GIRO.x, ARMA_GIRO.y, ARMA_GIRO.z);
    mao.add(arma);
    this.armaObjeto = arma;
  }

  /**
   * Deixa o boneco mais ou menos transparente (1 = opaco). Serve para enxergar
   * o inimigo que a câmera, atrás do jogador, teria escondido. O boneco de
   * primitivas, que é só reserva, não fada.
   */
  setOpacidade(valor: number): void {
    const alvo = Math.min(Math.max(valor, 0.1), 1);
    // Evita mexer nos materiais a cada quadro quando nada mudou.
    if (Math.abs(alvo - this.opacidade) < 0.01) return;
    this.opacidade = alvo;
    for (const material of this.materiais) {
      material.transparent = alvo < 1;
      material.opacity = alvo;
    }
  }

  /** Cor só vale para o boneco de primitivas; o modelo tem textura própria. */
  setColor(cor: string): void {
    this.primitivo?.pintar(cor);
  }

  /** Posição dos pés e rumo. */
  place(x: number, y: number, z: number, yaw: number): void {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw;
  }

  /**
   * Com `reiniciar`, o estado toca do começo mesmo que já seja o atual: é o que
   * faz dois golpes iguais seguidos darem duas animações.
   */
  animate(state: CharacterState, dt: number, reiniciar = false, mergulhando = false): void {
    if (this.modelo) {
      this.modelo.tocar(state, STATE_BLEND_SECONDS, reiniciar);
      this.modelo.avancar(dt, mergulhando ? POSE_DO_MERGULHO_S : undefined);
      return;
    }
    this.primitivo?.animar(state, dt);
  }

  dispose(): void {
    this.modelo?.descartar();
    this.primitivo?.descartar();
  }
}

/** Pose alvo de cada estado no boneco de primitivas. */
interface Pose {
  /** Velocidade do ciclo de passos, em rad/s. */
  readonly cadence: number;
  /** Amplitude do balanço de pernas e braços. */
  readonly legSwing: number;
  readonly armSwing: number;
  /** Deslocamento fixo de pernas e braços. */
  readonly legSpread: number;
  readonly armRaise: number;
  /** Inclinação do tronco (positivo = para frente). */
  readonly lean: number;
  readonly bob: number;
  readonly squash: number;
  /** Giro do rolamento, em rad/s. */
  readonly roll: number;
}

const BASE: Pose = {
  cadence: 2.2,
  legSwing: 0.04,
  armSwing: 0.06,
  legSpread: 0,
  armRaise: 0,
  lean: 0,
  bob: 0.015,
  squash: 1,
  roll: 0,
};

const POSES: Record<CharacterState, Pose> = {
  idle: BASE,
  run: { ...BASE, cadence: 11, legSwing: 0.75, armSwing: 0.65, lean: 0.14, bob: 0.04 },
  jump: {
    ...BASE,
    cadence: 0,
    legSwing: 0,
    legSpread: -0.5,
    armRaise: -2,
    lean: -0.1,
    squash: 1.06,
  },
  fall: {
    ...BASE,
    cadence: 0,
    legSwing: 0,
    legSpread: 0.35,
    armRaise: -1.2,
    lean: 0.08,
    squash: 0.96,
  },
  dodge: {
    ...BASE,
    cadence: 0,
    legSwing: 0,
    legSpread: -0.9,
    armRaise: -0.6,
    squash: 0.9,
    roll: 18,
  },
  hurt: { ...BASE, cadence: 0, legSpread: 0.2, armRaise: -0.8, lean: -0.35 },
  dead: { ...BASE, cadence: 0, legSwing: 0, armSwing: 0, lean: 1.45, squash: 0.85 },
  attack1: { ...BASE, cadence: 0, armRaise: -1.4, lean: 0.2 },
  attack2: { ...BASE, cadence: 0, armRaise: -1.6, lean: 0.25 },
  attack3: { ...BASE, cadence: 0, armRaise: -1.8, lean: 0.3 },
  charged: { ...BASE, cadence: 0, armRaise: -2.2, lean: -0.15, squash: 1.04 },
  plunge: { ...BASE, cadence: 0, legSpread: 0.2, armRaise: -2.4, lean: 0.35, squash: 0.94 },
};

function limb(width: number, height: number, depth: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  // O pivô fica no topo do membro, para girar pelo ombro ou pelo quadril.
  mesh.position.y = -height / 2;
  return mesh;
}

/** Boneco de primitivas com animação procedural, usado quando não há modelo. */
class BonecoPrimitivo {
  readonly raiz = new THREE.Group();

  private readonly pivot = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly legs: readonly THREE.Group[];
  private readonly arms: readonly THREE.Group[];
  private readonly skin: THREE.MeshLambertMaterial;

  private pose: Pose = BASE;
  private phase = 0;
  private rollAngle = 0;

  constructor(color: string) {
    const skin = new THREE.MeshLambertMaterial({ color });
    this.skin = skin;
    const dark = new THREE.MeshLambertMaterial({ color: '#3b3a52' });
    const white = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    const pupil = new THREE.MeshLambertMaterial({ color: '#2b2b3a' });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.35, 6, 12), skin);
    torso.position.y = 1.01;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), skin);
    head.position.y = 1.5;

    // Boné curto: mostra para onde o boneco está virado.
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.18), dark);
    visor.position.set(0, 1.62, 0.18);

    const eyes = [-0.1, 0.1].map((offsetX) => {
      const eye = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), white);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), pupil);
      iris.position.z = 0.05;
      eye.add(ball, iris);
      eye.position.set(offsetX, 1.52, 0.2);
      return eye;
    });

    this.legs = [-0.14, 0.14].map((offsetX) => {
      const hip = new THREE.Group();
      hip.position.set(offsetX, 0.62, 0);
      hip.add(limb(0.18, 0.62, 0.2, dark));
      return hip;
    });

    this.arms = [-0.34, 0.34].map((offsetX) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(offsetX, 1.22, 0);
      shoulder.add(limb(0.15, 0.5, 0.16, skin));
      return shoulder;
    });

    this.body.add(torso, head, visor, ...eyes, ...this.legs, ...this.arms);
    // O pivô na altura do quadril faz o rolamento girar pelo meio do corpo.
    this.pivot.position.y = 0.6;
    this.body.position.y = -0.6;
    this.pivot.add(this.body);
    this.raiz.add(this.pivot);
  }

  pintar(color: string): void {
    this.skin.color.set(color);
  }

  /** Mistura a pose do estado atual e avança o ciclo de animação. */
  animar(state: CharacterState, dt: number): void {
    const target = POSES[state];
    const blend = 1 - Math.exp(-dt / BLEND_TAU);
    this.pose = {
      cadence: mix(this.pose.cadence, target.cadence, blend),
      legSwing: mix(this.pose.legSwing, target.legSwing, blend),
      armSwing: mix(this.pose.armSwing, target.armSwing, blend),
      legSpread: mix(this.pose.legSpread, target.legSpread, blend),
      armRaise: mix(this.pose.armRaise, target.armRaise, blend),
      lean: mix(this.pose.lean, target.lean, blend),
      bob: mix(this.pose.bob, target.bob, blend),
      squash: mix(this.pose.squash, target.squash, blend),
      roll: mix(this.pose.roll, target.roll, blend),
    };

    this.phase += this.pose.cadence * dt;
    const swing = Math.sin(this.phase);

    if (state === 'dodge') {
      this.rollAngle += this.pose.roll * dt;
    } else if (this.rollAngle !== 0) {
      // Fim do rolamento: volta ao ângulo cheio mais próximo e relaxa até zero.
      const residual = wrapAngle(this.rollAngle);
      this.rollAngle = Math.abs(residual) < 0.02 ? 0 : mix(residual, 0, blend);
    }

    const [leftLeg, rightLeg] = this.legs;
    if (leftLeg && rightLeg) {
      leftLeg.rotation.x = this.pose.legSpread + swing * this.pose.legSwing;
      rightLeg.rotation.x = this.pose.legSpread - swing * this.pose.legSwing;
    }

    const [leftArm, rightArm] = this.arms;
    if (leftArm && rightArm) {
      leftArm.rotation.x = this.pose.armRaise - swing * this.pose.armSwing;
      rightArm.rotation.x = this.pose.armRaise + swing * this.pose.armSwing;
    }

    this.pivot.rotation.x = this.pose.lean + this.rollAngle;
    this.body.scale.set(1, this.pose.squash, 1);
    this.body.position.y = -0.6 + Math.abs(Math.sin(this.phase)) * this.pose.bob;
  }

  descartar(): void {
    this.raiz.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
      }
    });
  }
}

function mix(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}
