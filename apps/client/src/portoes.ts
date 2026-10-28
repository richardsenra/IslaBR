import * as THREE from 'three';
import { ARENA_GATES } from '@islabr/shared';

/**
 * Os portões das zonas fechadas (SPEC §7.1): uma bruma azulada de ponta a
 * ponta da divisa, que some quando a missão que libera a zona é aceita. A
 * colisão é a das caixas de world.json; isto é só o aviso para o jogador.
 */
export class Portoes {
  readonly group = new THREE.Group();
  private readonly malhas = new Map<string, THREE.Mesh[]>();

  constructor() {
    this.group.name = 'portoes';
    const material = new THREE.MeshBasicMaterial({
      color: '#9ad8ff',
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (const gate of ARENA_GATES) {
      // Só a parte baixa, até 3,5 m, que já deixa claro que ali não passa.
      const altura = Math.min(gate.sizeY, 3.5);
      const malha = new THREE.Mesh(new THREE.BoxGeometry(gate.sizeX, altura, gate.sizeZ), material);
      malha.position.set(gate.x, altura / 2, gate.z);
      malha.name = gate.id;
      this.group.add(malha);
      const lista = this.malhas.get(gate.zona) ?? [];
      lista.push(malha);
      this.malhas.set(gate.zona, lista);
    }
  }

  /** Mostra a bruma só nas zonas que o jogador ainda não abriu. */
  definirAbertas(abertas: ReadonlySet<string>): void {
    for (const [zona, lista] of this.malhas) {
      for (const malha of lista) malha.visible = !abertas.has(zona);
    }
  }
}
