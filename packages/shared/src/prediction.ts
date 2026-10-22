/**
 * Predição e reconciliação do jogador local (SPEC §4).
 *
 * O cliente simula o próprio movimento na hora e guarda os comandos enviados.
 * Quando o servidor recusa uma posição, volta para a última aceita e reaplica
 * os comandos seguintes, de forma que a correção não perca o que o jogador fez
 * durante a viagem do pacote.
 */

import type { Box } from './collision.js';
import { stepPlayer, type MoveInput, type PlayerPhysics } from './movement.js';
import type { MoveCorrectionPayload, MovePayload } from './net.js';

interface HistoryEntry {
  readonly input: MoveInput;
  readonly result: PlayerPhysics;
}

/** Comando sem o número de sequência, que é atribuído aqui. */
export type PendingInput = Omit<MoveInput, 'seq'>;

export class PredictedPlayer {
  private physics: PlayerPhysics;
  private history: HistoryEntry[] = [];
  private seq = 0;
  private corrections = 0;

  constructor(
    start: PlayerPhysics,
    private readonly boxes: readonly Box[],
    /** Quantos comandos guardar; 240 cobre 4 s a 60 Hz. */
    private readonly maxHistory = 240,
  ) {
    this.physics = start;
  }

  get current(): PlayerPhysics {
    return this.physics;
  }

  get lastSeq(): number {
    return this.seq;
  }

  /** Quantas correções o servidor já mandou (aparece no HUD de depuração). */
  get correctionCount(): number {
    return this.corrections;
  }

  step(command: PendingInput): PlayerPhysics {
    this.seq += 1;
    const input: MoveInput = { ...command, seq: this.seq };
    this.physics = stepPlayer(this.physics, input, this.boxes);
    this.history.push({ input, result: this.physics });
    if (this.history.length > this.maxHistory) {
      this.history.splice(0, this.history.length - this.maxHistory);
    }
    return this.physics;
  }

  toMovePayload(): MovePayload {
    const { x, y, z, vx, vy, vz, yaw, state } = this.physics;
    return { seq: this.seq, x, y, z, vx, vy, vz, yaw, state };
  }

  /**
   * Volta para a posição que o servidor aceitou e reaplica os comandos
   * posteriores. Sem o comando correspondente no histórico, só reposiciona.
   */
  applyCorrection(correction: Pick<MoveCorrectionPayload, 'seq' | 'x' | 'y' | 'z'>): void {
    this.corrections += 1;

    const index = this.history.findIndex((entry) => entry.input.seq === correction.seq);
    const base = index >= 0 ? this.history[index]?.result : undefined;
    const pending = this.history.slice(index + 1);

    let physics: PlayerPhysics = base
      ? { ...base, x: correction.x, y: correction.y, z: correction.z }
      : {
          ...this.physics,
          x: correction.x,
          y: correction.y,
          z: correction.z,
          vx: 0,
          vy: 0,
          vz: 0,
        };

    const replayed: HistoryEntry[] = [];
    for (const entry of pending) {
      physics = stepPlayer(physics, entry.input, this.boxes);
      replayed.push({ input: entry.input, result: physics });
    }

    this.physics = physics;
    this.history = replayed;
  }
}
