import * as THREE from 'three';
import { ARENA_PIECES } from '@islabr/shared';

/**
 * Desenha a arena de testes do M1 a partir das mesmas peças que o servidor usa
 * para validar posição. O greybox das zonas chega no M4.
 */
export function createArena(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'arena';

  for (const piece of ARENA_PIECES) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(piece.sizeX, piece.sizeY, piece.sizeZ),
      new THREE.MeshLambertMaterial({ color: piece.color }),
    );
    mesh.position.set(piece.x, piece.y, piece.z);
    mesh.name = piece.id;
    group.add(mesh);
  }

  return group;
}
