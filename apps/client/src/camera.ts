import * as THREE from 'three';
import { rayDistance, type Box } from '@islabr/shared';

const MIN_PITCH = -0.45;
const MAX_PITCH = 1.1;
const MIN_DISTANCE = 1.4;
const MAX_DISTANCE = 9;
/** Raio usado na checagem contra parede, para a câmera não roçar a geometria. */
const CAMERA_RADIUS = 0.3;
/** Altura do alvo acima dos pés do personagem. */
const TARGET_HEIGHT = 1.2;
/** A aproximação por colisão é imediata; o afastamento é suave. */
const PULL_OUT_PER_SECOND = 6;

/**
 * Câmera em terceira pessoa com colisão contra o cenário (SPEC §6). O yaw dela
 * é o que define a direção de "frente" do controle.
 */
export class ThirdPersonCamera {
  yaw: number;
  private pitch = 0.32;
  private wanted = 6;
  private current = 6;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    startYaw = 0,
  ) {
    this.yaw = startYaw;
  }

  orbit(deltaYaw: number, deltaPitch: number): void {
    this.yaw += deltaYaw;
    this.pitch = Math.min(Math.max(this.pitch + deltaPitch, MIN_PITCH), MAX_PITCH);
  }

  zoom(delta: number): void {
    this.wanted = Math.min(Math.max(this.wanted + delta, MIN_DISTANCE), MAX_DISTANCE);
  }

  /** Posiciona a câmera atrás do alvo, encurtando se houver parede no caminho. */
  update(
    targetX: number,
    targetY: number,
    targetZ: number,
    boxes: readonly Box[],
    dt: number,
  ): void {
    const focusY = targetY + TARGET_HEIGHT;
    const cosPitch = Math.cos(this.pitch);
    // Direção do alvo para a câmera: o inverso de para onde a câmera olha.
    const backX = -Math.sin(this.yaw) * cosPitch;
    const backY = Math.sin(this.pitch);
    const backZ = -Math.cos(this.yaw) * cosPitch;

    const free = rayDistance(
      targetX,
      focusY,
      targetZ,
      backX,
      backY,
      backZ,
      this.wanted,
      boxes,
      CAMERA_RADIUS,
    );
    const allowed = Math.max(free, MIN_DISTANCE);

    if (allowed < this.current) {
      this.current = allowed;
    } else {
      this.current = Math.min(allowed, this.current + PULL_OUT_PER_SECOND * dt);
    }

    this.camera.position.set(
      targetX + backX * this.current,
      focusY + backY * this.current,
      targetZ + backZ * this.current,
    );
    this.camera.lookAt(targetX, focusY, targetZ);
  }
}
