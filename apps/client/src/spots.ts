import * as THREE from 'three';
import { ARENA_SPOTS, type InteractSpot } from '@islabr/shared';
import { Avatar } from './avatar.js';

/**
 * Alvos de interação desenhados: NPC vira boneco, objeto e baú viram caixa.
 * Por cima do alvo mais perto flutua o ícone da tecla F (SPEC §6).
 */

const ICON_HEIGHT = 2.3;

function criarIcone(): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(64, 64, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2b3a';
    ctx.beginPath();
    ctx.arc(64, 64, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('F', 64, 70);
  }
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(0.5, 0.5, 0.5);
  sprite.renderOrder = 10;
  sprite.visible = false;
  return sprite;
}

interface Desenhado {
  readonly spot: InteractSpot;
  readonly raiz: THREE.Object3D;
  readonly avatar?: Avatar;
}

export class Spots {
  readonly group = new THREE.Group();

  private readonly desenhados: Desenhado[] = [];
  private readonly icone = criarIcone();
  private readonly escondidos = new Set<string>();
  private tempo = 0;

  constructor() {
    this.group.name = 'alvos';

    for (const spot of ARENA_SPOTS) {
      if (spot.tipo === 'npc') {
        const avatar = new Avatar(spot.cor);
        avatar.place(spot.x, spot.y, spot.z, Math.PI);
        this.group.add(avatar.root);
        this.desenhados.push({ spot, raiz: avatar.root, avatar });
        continue;
      }

      const alto = spot.tipo === 'bau' ? 0.7 : 0.9;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, alto, 0.9),
        new THREE.MeshLambertMaterial({ color: spot.cor }),
      );
      mesh.position.set(spot.x, spot.y + alto / 2, spot.z);
      mesh.name = spot.id;
      this.group.add(mesh);
      this.desenhados.push({ spot, raiz: mesh });
    }

    this.group.add(this.icone);
  }

  /** Esconde o que o jogador já resolveu (caixa quebrada, baú aberto). */
  esconder(spotId: string): void {
    this.escondidos.add(spotId);
    const alvo = this.desenhados.find((d) => d.spot.id === spotId);
    if (alvo) alvo.raiz.visible = false;
  }

  estaVisivel(spotId: string): boolean {
    return !this.escondidos.has(spotId);
  }

  /**
   * Anima os NPCs, vira eles para o jogador e põe o ícone sobre o alvo atual.
   */
  update(
    dt: number,
    jogador: { x: number; y: number; z: number },
    alvo: InteractSpot | undefined,
  ): void {
    this.tempo += dt;

    for (const { spot, avatar } of this.desenhados) {
      if (!avatar) continue;
      const dx = jogador.x - spot.x;
      const dz = jogador.z - spot.z;
      // De longe o NPC fica parado olhando para a frente; de perto, encara.
      const perto = Math.hypot(dx, dz) < 8;
      avatar.place(spot.x, spot.y, spot.z, perto ? Math.atan2(dx, dz) : Math.PI);
      avatar.animate('idle', dt);
    }

    if (!alvo || this.escondidos.has(alvo.id)) {
      this.icone.visible = false;
      return;
    }
    this.icone.visible = true;
    this.icone.position.set(alvo.x, alvo.y + ICON_HEIGHT + Math.sin(this.tempo * 3) * 0.08, alvo.z);
  }
}
