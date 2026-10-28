import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getResource } from '@islabr/content';
import { TREE_TRUNK_WIDTH } from '@islabr/shared';
import { alturaDoModelo, criarModeloDoCenario, modeloDoCenarioPronto } from './cenario.js';
import type { NetTree } from './network.js';

/**
 * Árvores cortáveis. O estado — quantos golpes faltam — vem do servidor; aqui
 * só se desenha e se anima. São de primitivas, como a arena: não há árvore nos
 * assets CC0 que o jogo usa.
 *
 * Orçamento (SPEC §10: até 150 desenhos por zona): tronco, galhos e folhas de
 * cada árvore são uma geometria só, com a cor nos vértices, então cada árvore
 * custa um desenho. Os tocos, todos iguais, são uma malha instanciada: um
 * desenho para todos. O toco fica sempre no lugar, e é dele que a árvore volta
 * a crescer.
 */

/** Modelos que desenham as árvores cortáveis (Stylized Nature MegaKit). */
const MODELOS_COQUEIRO = ['CommonTree_1', 'CommonTree_2', 'CommonTree_3'] as const;
const MODELOS_SECA = ['DeadTree_1', 'DeadTree_2', 'DeadTree_3'] as const;
export const MODELOS_DAS_ARVORES: readonly string[] = [...MODELOS_COQUEIRO, ...MODELOS_SECA];

/** Quanto tempo o tombo da árvore leva na tela. */
const TOMBO_SEGUNDOS = 0.9;
/** Quanto tempo o tronco derrubado leva para sumir, depois de tombar. */
const SUMICO_SEGUNDOS = 0.35;
/** Quanto tempo a árvore leva para crescer de volta. */
const CRESCER_SEGUNDOS = 0.8;
/** Duração do tremor de quem levou machadada. */
const TREMOR_SEGUNDOS = 0.25;

const CASCA = new THREE.Color('#7a5230');
const CASCA_SECA = new THREE.Color('#8b7b63');
const FOLHA = new THREE.Color('#3f9142');
const FOLHA_CLARA = new THREE.Color('#5bbf52');

/** Geometria de cada tipo de árvore, feita uma vez e clonada por boneco. */
const geometrias = new Map<string, THREE.BufferGeometry>();

const materialDaArvore = new THREE.MeshLambertMaterial({ vertexColors: true });

/** Junta as partes numa geometria só, para a árvore custar um desenho. */
function juntar(partes: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  const uma = mergeGeometries([...partes], false);
  if (!uma) throw new Error('não deu para juntar a geometria da árvore');
  return uma;
}

function pintar(geometria: THREE.BufferGeometry, cor: THREE.Color): THREE.BufferGeometry {
  const quantos = geometria.attributes['position']?.count ?? 0;
  const cores = new Float32Array(quantos * 3);
  for (let i = 0; i < quantos; i += 1) {
    cores[i * 3] = cor.r;
    cores[i * 3 + 1] = cor.g;
    cores[i * 3 + 2] = cor.b;
  }
  geometria.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  return geometria;
}

/** Coqueiro: tronco alto e fino, com folhas abertas no topo. */
function geometriaDoCoqueiro(altura: number, raio: number): THREE.BufferGeometry {
  const partes: THREE.BufferGeometry[] = [];

  const tronco = new THREE.CylinderGeometry(raio * 0.75, raio, altura, 7);
  tronco.translate(0, altura / 2, 0);
  partes.push(pintar(tronco, CASCA));

  const folhas = 6;
  for (let i = 0; i < folhas; i += 1) {
    const angulo = (i / folhas) * Math.PI * 2;
    const folha = new THREE.ConeGeometry(0.42, 2.1, 4);
    folha.scale(1, 1, 0.25);
    // Deitada para fora e levemente para baixo, como palma de coqueiro.
    folha.rotateZ(Math.PI / 2);
    folha.translate(1.05, 0, 0);
    folha.rotateZ(-0.5);
    folha.rotateY(angulo);
    folha.translate(0, altura - 0.15, 0);
    partes.push(pintar(folha, i % 2 === 0 ? FOLHA : FOLHA_CLARA));
  }

  const coroa = new THREE.SphereGeometry(raio * 1.3, 7, 5);
  coroa.translate(0, altura - 0.1, 0);
  partes.push(pintar(coroa, CASCA));

  return juntar(partes);
}

/** Árvore seca: tronco curto e três galhos nus. */
function geometriaDaArvoreSeca(altura: number, raio: number): THREE.BufferGeometry {
  const partes: THREE.BufferGeometry[] = [];

  const tronco = new THREE.CylinderGeometry(raio * 0.7, raio, altura, 6);
  tronco.translate(0, altura / 2, 0);
  partes.push(pintar(tronco, CASCA_SECA));

  const galhos = 3;
  for (let i = 0; i < galhos; i += 1) {
    const galho = new THREE.CylinderGeometry(raio * 0.16, raio * 0.3, altura * 0.42, 5);
    galho.translate(0, altura * 0.21, 0);
    galho.rotateZ(0.9);
    galho.rotateY((i / galhos) * Math.PI * 2 + 0.4);
    galho.translate(0, altura * (0.55 + i * 0.12), 0);
    partes.push(pintar(galho, CASCA_SECA));
  }

  return juntar(partes);
}

function geometriaDo(tipo: string): THREE.BufferGeometry {
  const pronta = geometrias.get(tipo);
  if (pronta) return pronta;
  const recurso = getResource(tipo);
  const raio = recurso.raio;
  const nova =
    tipo === 'r02'
      ? geometriaDaArvoreSeca(recurso.altura, raio)
      : geometriaDoCoqueiro(recurso.altura, raio);
  geometrias.set(tipo, nova);
  return nova;
}

/**
 * A árvore em pé: o modelo do pacote, na altura do recurso, e um de três
 * modelos por árvore para o mato não sair repetido. Sem o modelo, cai de volta
 * na árvore de primitivas.
 */
function criarMalha(tipo: string, x: number, z: number): THREE.Object3D {
  const lista = tipo === 'r02' ? MODELOS_SECA : MODELOS_COQUEIRO;
  const nome = lista[Math.abs(Math.floor(x * 7 + z * 13)) % lista.length];
  if (nome && modeloDoCenarioPronto(nome)) {
    const escala = getResource(tipo).altura / alturaDoModelo(nome);
    return criarModeloDoCenario(nome, escala);
  }
  return new THREE.Mesh(geometriaDo(tipo), materialDaArvore);
}

/** Uma árvore na tela: em pé, tombando, no chão ou crescendo de novo. */
class Arvore {
  readonly malha: THREE.Object3D;
  /** Golpes que faltavam no último pacote, para saber quando ela levou uma. */
  private golpes: number;
  private tombo = 0;
  private crescer = 0;
  private tremor = 0;
  /** Lado para onde ela tomba, sorteado uma vez por árvore. */
  private readonly lado: number;

  constructor(
    readonly id: string,
    tipo: string,
    x: number,
    z: number,
    golpes: number,
  ) {
    this.malha = criarMalha(tipo, x, z);
    this.malha.position.set(x, 0, z);
    this.malha.rotation.y = (x * 7919 + z * 104729) % Math.PI;
    this.golpes = golpes;
    this.lado = ((x * 31 + z * 17) % 2 === 0 ? 1 : -1) * (0.6 + (Math.abs(x + z) % 5) / 10);
    if (golpes === 0) {
      this.tombo = TOMBO_SEGUNDOS + SUMICO_SEGUNDOS;
      this.malha.visible = false;
    }
  }

  /** Chegou pacote novo do servidor. */
  sync(golpes: number): void {
    if (golpes === this.golpes) return;
    const caiu = golpes === 0 && this.golpes > 0;
    const voltou = golpes > 0 && this.golpes === 0;
    this.golpes = golpes;

    if (caiu) {
      this.tombo = 0.001;
      return;
    }
    if (voltou) {
      this.tombo = 0;
      this.crescer = 0.001;
      this.malha.visible = true;
      return;
    }
    // Levou machadada e continua em pé.
    this.tremor = TREMOR_SEGUNDOS;
  }

  update(dt: number): void {
    const malha = this.malha;

    if (this.tombo > 0) {
      this.tombo += dt;
      const tombando = Math.min(this.tombo / TOMBO_SEGUNDOS, 1);
      // Acelera como quem perde o equilíbrio, em vez de girar por igual.
      const queda = tombando * tombando;
      malha.rotation.z = this.lado * queda * (Math.PI / 2);
      if (this.tombo > TOMBO_SEGUNDOS) {
        const sumindo = Math.min((this.tombo - TOMBO_SEGUNDOS) / SUMICO_SEGUNDOS, 1);
        const escala = Math.max(1 - sumindo, 0.001);
        malha.scale.setScalar(escala);
        if (sumindo >= 1) malha.visible = false;
      }
      return;
    }

    if (this.crescer > 0) {
      this.crescer += dt;
      const t = Math.min(this.crescer / CRESCER_SEGUNDOS, 1);
      malha.rotation.z = 0;
      malha.scale.setScalar(t);
      if (t >= 1) {
        this.crescer = 0;
        malha.scale.setScalar(1);
      }
      return;
    }

    if (this.tremor > 0) {
      this.tremor = Math.max(this.tremor - dt, 0);
      const forca = (this.tremor / TREMOR_SEGUNDOS) * 0.05;
      malha.rotation.z = Math.sin(this.tremor * 70) * forca;
      return;
    }

    malha.rotation.z = 0;
  }

  descartar(): void {
    this.malha.removeFromParent();
  }
}

export class Trees {
  readonly group = new THREE.Group();
  private readonly arvores = new Map<string, Arvore>();
  private tocos: THREE.InstancedMesh | null = null;

  constructor() {
    this.group.name = 'arvores';
  }

  sync(arvores: readonly NetTree[]): void {
    for (const net of arvores) {
      const pronta = this.arvores.get(net.id);
      if (pronta) {
        pronta.sync(net.golpes);
        continue;
      }
      const nova = new Arvore(net.id, net.tipo, net.x, net.z, net.golpes);
      this.arvores.set(net.id, nova);
      this.group.add(nova.malha);
    }

    for (const [id, arvore] of this.arvores) {
      if (arvores.some((net) => net.id === id)) continue;
      arvore.descartar();
      this.arvores.delete(id);
    }

    this.cuidarDosTocos(arvores);
  }

  /** Um desenho para todos os tocos: eles não mudam nem se mexem. */
  private cuidarDosTocos(arvores: readonly NetTree[]): void {
    if (this.tocos && this.tocos.count === arvores.length) return;
    this.tocos?.removeFromParent();
    this.tocos?.dispose();
    if (arvores.length === 0) {
      this.tocos = null;
      return;
    }

    const geometria = pintar(
      new THREE.CylinderGeometry(TREE_TRUNK_WIDTH * 0.42, TREE_TRUNK_WIDTH * 0.5, 0.45, 7),
      CASCA,
    );
    geometria.translate(0, 0.22, 0);
    const tocos = new THREE.InstancedMesh(geometria, materialDaArvore, arvores.length);
    const posicao = new THREE.Matrix4();
    for (const [i, net] of arvores.entries()) {
      posicao.makeTranslation(net.x, 0, net.z);
      tocos.setMatrixAt(i, posicao);
    }
    tocos.instanceMatrix.needsUpdate = true;
    this.group.add(tocos);
    this.tocos = tocos;
  }

  update(dt: number): void {
    for (const arvore of this.arvores.values()) arvore.update(dt);
  }
}
