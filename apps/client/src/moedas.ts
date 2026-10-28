import * as THREE from 'three';
import { ARENA_COINS } from '@islabr/shared';

/**
 * As moedas soltas pela ilha (SPEC §7.5): discos dourados que giram e somem
 * quando o servidor confirma que o jogador as pegou. Uma malha instanciada só.
 */
export class Moedas {
  readonly group = new THREE.Group();
  private readonly malha: THREE.InstancedMesh;
  private readonly indices = new Map<string, number>();
  private readonly pegas = new Set<string>();
  private tempo = 0;

  constructor() {
    this.group.name = 'moedas';
    const geometria = new THREE.CylinderGeometry(0.28, 0.28, 0.07, 18);
    geometria.rotateX(Math.PI / 2);
    this.malha = new THREE.InstancedMesh(
      geometria,
      new THREE.MeshLambertMaterial({ color: '#ffd23f', emissive: '#7a5a00' }),
      Math.max(ARENA_COINS.length, 1),
    );
    for (const [i, moeda] of ARENA_COINS.entries()) this.indices.set(moeda.id, i);
    this.group.add(this.malha);
    this.desenhar();
  }

  pegar(id: string): void {
    this.pegas.add(id);
    this.desenhar();
  }

  update(dt: number): void {
    this.tempo += dt;
    this.desenhar();
  }

  private desenhar(): void {
    const matriz = new THREE.Matrix4();
    const posicao = new THREE.Vector3();
    const rotacao = new THREE.Quaternion();
    const escala = new THREE.Vector3();
    const eixoY = new THREE.Vector3(0, 1, 0);
    for (const moeda of ARENA_COINS) {
      const i = this.indices.get(moeda.id);
      if (i === undefined) continue;
      const some = this.pegas.has(moeda.id);
      posicao.set(moeda.x, moeda.y + 0.8 + Math.sin(this.tempo * 2 + i) * 0.08, moeda.z);
      rotacao.setFromAxisAngle(eixoY, this.tempo * 2.2 + i);
      escala.setScalar(some ? 0.0001 : 1);
      this.malha.setMatrixAt(i, matriz.compose(posicao, rotacao, escala));
    }
    this.malha.instanceMatrix.needsUpdate = true;
  }
}
