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
    // Um modelo do cenário desenha no lugar; a colisão continua valendo.
    if (!piece.visivel) continue;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(piece.sizeX, piece.sizeY, piece.sizeZ),
      new THREE.MeshLambertMaterial({ color: piece.color }),
    );
    mesh.position.set(piece.x, piece.y, piece.z);
    mesh.name = piece.id;
    group.add(mesh);
  }

  // O mar em volta da ilha.
  const mar = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshLambertMaterial({ color: '#3aa6d9' }),
  );
  mar.rotation.x = -Math.PI / 2;
  mar.position.y = -0.7;
  group.add(mar);

  return group;
}
