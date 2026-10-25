import * as THREE from 'three';
import type { AttackKind } from '@islabr/shared';

/**
 * Rastro de corte e onda de choque: o que deixa o golpe com peso na tela.
 *
 * É só visual. O dano já foi decidido pelo servidor; isto aparece no instante
 * do impacto, junto com o hit-stop e o tremor, para o golpe ser visto e não só
 * lido no número. Cada golpe do combo tem o seu desenho: corte diagonal,
 * varrida horizontal e golpe de cima, e o carregado ainda abre uma onda no chão.
 */

interface Vivo {
  readonly raiz: THREE.Group;
  readonly malha: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  idade: number;
  readonly vida: number;
  /** Escala no começo e no fim da vida. */
  readonly de: number;
  readonly ate: number;
  /** Giro do arco enquanto dura, em rad/s, para parecer varrido e não carimbado. */
  readonly varrida: number;
}

const COR: Readonly<Record<AttackKind, string>> = {
  attack1: '#bfe8ff',
  attack2: '#bfe8ff',
  attack3: '#fff0a8',
  charged: '#ffd27a',
};

/** A que altura do chão o rastro nasce, para sair na altura do peito. */
const ALTURA = 1.05;
/** Quanto à frente do personagem. */
const A_FRENTE = 1.05;

export class Rastros {
  readonly group = new THREE.Group();

  private readonly vivos: Vivo[] = [];

  constructor() {
    this.group.name = 'rastros';
  }

  /** Solta o rastro do golpe, na posição e no rumo de quem bateu. */
  golpe(tipo: AttackKind, x: number, y: number, z: number, yaw: number): void {
    const frente = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const centro = new THREE.Vector3(x, y + ALTURA, z).addScaledVector(frente, A_FRENTE);

    switch (tipo) {
      case 'attack1':
        // Corte diagonal: o arco fica inclinado, do alto da direita para baixo.
        this.arco(tipo, centro, yaw, { comeco: 0.25, tamanho: 2.3, inclinacao: -0.65, escala: 1 });
        return;
      case 'attack2':
        // Varrida horizontal: o arco deita, na altura do peito.
        this.varrida(tipo, centro, yaw);
        return;
      case 'attack3':
        // Golpe de cima: arco vertical, maior, para fechar o combo.
        this.arco(tipo, centro, yaw, { comeco: 0.55, tamanho: 2.0, inclinacao: 0, escala: 1.35 });
        return;
      case 'charged': {
        // Salto com golpe de cima: o arco grande mais a onda de choque no chão.
        this.arco(tipo, centro, yaw, { comeco: 0.55, tamanho: 2.1, inclinacao: 0, escala: 1.7 });
        const chao = new THREE.Vector3(x, y + 0.06, z).addScaledVector(frente, 1.5);
        this.onda(tipo, chao);
        return;
      }
    }
  }

  /** Avança o tempo e apaga o que já acabou. */
  update(dt: number): void {
    for (let i = this.vivos.length - 1; i >= 0; i -= 1) {
      const vivo = this.vivos[i];
      if (!vivo) continue;
      vivo.idade += dt;
      const t = vivo.idade / vivo.vida;

      if (t >= 1) {
        this.remover(i);
        continue;
      }

      // Sai rápido e some devagar: o começo é o que o olho pega.
      const sai = 1 - (1 - t) * (1 - t);
      vivo.raiz.scale.setScalar(vivo.de + (vivo.ate - vivo.de) * sai);
      vivo.malha.rotation.z += vivo.varrida * dt;
      vivo.material.opacity = 0.95 * (1 - t) * (1 - t);
    }
  }

  private arco(
    tipo: AttackKind,
    centro: THREE.Vector3,
    yaw: number,
    forma: { comeco: number; tamanho: number; inclinacao: number; escala: number },
  ): void {
    // O anel vive no plano XY; girar em Y o vira para onde o personagem olha, de
    // modo que a câmera, atrás dele, enxerga o arco de frente.
    const geometria = new THREE.RingGeometry(0.8, 1.25, 32, 1, forma.comeco, forma.tamanho);
    const { raiz, malha, material } = this.criar(tipo, geometria);
    raiz.position.copy(centro);
    raiz.rotation.y = yaw;
    malha.rotation.z = forma.inclinacao;
    this.registrar({
      raiz,
      malha,
      material,
      idade: 0,
      vida: 0.22,
      de: forma.escala * 0.8,
      ate: forma.escala * 1.15,
      varrida: forma.inclinacao < 0 ? -2.2 : 0,
    });
  }

  private varrida(tipo: AttackKind, centro: THREE.Vector3, yaw: number): void {
    // Deitado, o ângulo 0 do anel aponta para +X e o ângulo de -90° para a frente
    // do personagem: o arco é centrado nesse ângulo.
    const tamanho = 2.6;
    const geometria = new THREE.RingGeometry(0.8, 1.3, 32, 1, -Math.PI / 2 - tamanho / 2, tamanho);
    const { raiz, malha, material } = this.criar(tipo, geometria);
    raiz.position.copy(centro);
    raiz.position.y -= 0.1;
    raiz.rotation.y = yaw;
    malha.rotation.x = -Math.PI / 2;
    this.registrar({
      raiz,
      malha,
      material,
      idade: 0,
      vida: 0.2,
      de: 0.85,
      ate: 1.2,
      varrida: 0,
    });
  }

  private onda(tipo: AttackKind, chao: THREE.Vector3): void {
    const geometria = new THREE.RingGeometry(0.85, 1, 48);
    const { raiz, malha, material } = this.criar(tipo, geometria);
    raiz.position.copy(chao);
    malha.rotation.x = -Math.PI / 2;
    this.registrar({
      raiz,
      malha,
      material,
      idade: 0,
      vida: 0.45,
      de: 0.5,
      ate: 2.8,
      varrida: 0,
    });
  }

  private criar(
    tipo: AttackKind,
    geometria: THREE.BufferGeometry,
  ): { raiz: THREE.Group; malha: THREE.Mesh; material: THREE.MeshBasicMaterial } {
    const material = new THREE.MeshBasicMaterial({
      color: COR[tipo],
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const malha = new THREE.Mesh(geometria, material);
    const raiz = new THREE.Group();
    raiz.add(malha);
    return { raiz, malha, material };
  }

  private registrar(vivo: Vivo): void {
    this.group.add(vivo.raiz);
    this.vivos.push(vivo);
  }

  private remover(indice: number): void {
    const [vivo] = this.vivos.splice(indice, 1);
    if (!vivo) return;
    this.group.remove(vivo.raiz);
    vivo.malha.geometry.dispose();
    vivo.material.dispose();
  }
}
