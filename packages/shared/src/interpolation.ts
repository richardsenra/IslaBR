/**
 * Interpolação dos jogadores remotos (SPEC §4).
 *
 * O estado chega de 10 a 20 Hz. Em vez de desenhar o pacote mais novo (que dá
 * saltos), o cliente desenha o passado recente: `INTERP_DELAY_MS` atrás, entre
 * dois pacotes já recebidos.
 */

import { lerpAngle } from './movement.js';
import type { CharacterState } from './character.js';
import { INTERP_DELAY_MS } from './net.js';

export interface RemoteSnapshot {
  /** Instante em que o pacote chegou, em ms do relógio local. */
  readonly t: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly state: CharacterState;
}

export interface InterpolatedPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly state: CharacterState;
}

/** Pacotes mais velhos que isto, além dos dois últimos, são descartados. */
const KEEP_MS = 1000;

export class SnapshotBuffer {
  private snapshots: RemoteSnapshot[] = [];

  push(snapshot: RemoteSnapshot): void {
    const last = this.snapshots[this.snapshots.length - 1];
    if (last && snapshot.t < last.t) return;
    this.snapshots.push(snapshot);
    this.prune(snapshot.t);
  }

  get size(): number {
    return this.snapshots.length;
  }

  /** Pose a desenhar agora, ou `null` se nada chegou ainda. */
  sample(nowMs: number, delayMs = INTERP_DELAY_MS): InterpolatedPose | null {
    const renderAt = nowMs - delayMs;
    const first = this.snapshots[0];
    if (!first) return null;
    if (renderAt <= first.t) return pose(first);

    for (let i = this.snapshots.length - 1; i >= 0; i -= 1) {
      const before = this.snapshots[i];
      if (!before || before.t > renderAt) continue;

      const after = this.snapshots[i + 1];
      // Sem pacote seguinte, segura o último conhecido em vez de extrapolar.
      if (!after) return pose(before);

      const span = after.t - before.t;
      const t = span > 0 ? (renderAt - before.t) / span : 1;
      return {
        x: before.x + (after.x - before.x) * t,
        y: before.y + (after.y - before.y) * t,
        z: before.z + (after.z - before.z) * t,
        yaw: lerpAngle(before.yaw, after.yaw, t),
        // O estado novo é o que explica o movimento entre os dois pacotes.
        state: after.state,
      };
    }

    return pose(first);
  }

  private prune(nowMs: number): void {
    while (this.snapshots.length > 2) {
      const second = this.snapshots[1];
      if (!second || second.t >= nowMs - KEEP_MS) break;
      this.snapshots.shift();
    }
  }
}

function pose(snapshot: RemoteSnapshot): InterpolatedPose {
  return {
    x: snapshot.x,
    y: snapshot.y,
    z: snapshot.z,
    yaw: snapshot.yaw,
    state: snapshot.state,
  };
}
