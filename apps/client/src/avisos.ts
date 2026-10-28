import * as THREE from 'three';
import type { TelegraphPayload } from '@islabr/shared';

/**
 * Círculos vermelhos no chão: o aviso dos golpes em área dos chefes. Crescem
 * por dentro até o instante do golpe, que é quando o servidor confere quem
 * ainda está lá. Quem sai do círculo a tempo não leva nada.
 */
interface Aviso {
  readonly grupo: THREE.Group;
  readonly miolo: THREE.Mesh;
  readonly borda: THREE.Mesh;
  tempo: number;
  total: number;
}

export class Avisos {
  readonly group = new THREE.Group();
  private readonly ativos: Aviso[] = [];

  constructor() {
    this.group.name = 'avisos';
  }

  mostrar(aviso: TelegraphPayload): void {
    const grupo = new THREE.Group();
    const miolo = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40),
      new THREE.MeshBasicMaterial({
        color: '#ff3b3b',
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      }),
    );
    miolo.rotation.x = -Math.PI / 2;
    const borda = new THREE.Mesh(
      new THREE.RingGeometry(0.94, 1, 48),
      new THREE.MeshBasicMaterial({
        color: '#ffd0d0',
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    borda.rotation.x = -Math.PI / 2;
    grupo.add(miolo, borda);
    grupo.position.set(aviso.x, 0.06, aviso.z);
    grupo.scale.set(aviso.raio, 1, aviso.raio);
    miolo.scale.setScalar(0.05);
    this.group.add(grupo);
    this.ativos.push({ grupo, miolo, borda, tempo: 0, total: Math.max(aviso.segundos, 0.1) });
  }

  update(dt: number): void {
    for (let i = this.ativos.length - 1; i >= 0; i -= 1) {
      const aviso = this.ativos[i];
      if (!aviso) continue;
      aviso.tempo += dt;
      const t = Math.min(aviso.tempo / aviso.total, 1);
      aviso.miolo.scale.setScalar(Math.max(t, 0.05));
      if (aviso.tempo > aviso.total + 0.25) {
        aviso.grupo.removeFromParent();
        aviso.miolo.geometry.dispose();
        aviso.borda.geometry.dispose();
        this.ativos.splice(i, 1);
      }
    }
  }
}
