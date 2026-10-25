import { describe, expect, it } from 'vitest';
import { boxFromCenter, type Box } from './collision.js';
import { MOVE_SPEED, spawnPhysics, stepPlayer, type MoveInput } from './movement.js';
import { PredictedPlayer, type PendingInput } from './prediction.js';

const STEP = 1 / 60;
const FLOOR: readonly Box[] = [boxFromCenter(0, -0.5, 0, 100, 1, 100)];

function command(partial: Partial<PendingInput> = {}): PendingInput {
  return { dt: STEP, moveX: 0, moveZ: 0, jump: false, dodge: false, ...partial };
}

function settled(): PredictedPlayer {
  const player = new PredictedPlayer(spawnPhysics(0, 1, 0), FLOOR);
  for (let i = 0; i < 30; i += 1) player.step(command());
  return player;
}

describe('PredictedPlayer', () => {
  it('numera os comandos em sequência', () => {
    const player = settled();
    expect(player.lastSeq).toBe(30);
    player.step(command());
    expect(player.lastSeq).toBe(31);
    expect(player.toMovePayload().seq).toBe(31);
  });

  it('o payload descreve a física atual', () => {
    const player = settled();
    player.step(command({ moveZ: 1 }));
    const payload = player.toMovePayload();
    expect(payload.vz).toBeCloseTo(MOVE_SPEED, 6);
    expect(payload.state).toBe('run');
    expect(payload.z).toBeCloseTo(player.current.z, 6);
  });

  it('simula igual ao passo puro', () => {
    const player = new PredictedPlayer(spawnPhysics(0, 1, 0), FLOOR);
    let direct = spawnPhysics(0, 1, 0);
    for (let i = 0; i < 90; i += 1) {
      const cmd = command({ moveZ: 1, jump: i === 40 });
      player.step(cmd);
      const input: MoveInput = { ...cmd, seq: i + 1 };
      direct = stepPlayer(direct, input, FLOOR);
    }
    expect(player.current).toEqual(direct);
  });

  it('reaplica os comandos pendentes depois de uma correção', () => {
    const player = settled();
    // 10 comandos andando para +Z; o servidor só aceitou o primeiro.
    for (let i = 0; i < 10; i += 1) player.step(command({ moveZ: 1 }));
    const acceptedSeq = 31;
    const accepted = player.current.z - MOVE_SPEED * STEP * 9;

    player.applyCorrection({ seq: acceptedSeq, x: 0, y: 0, z: accepted });

    // Os 9 comandos seguintes voltam a valer, a partir da posição aceita.
    expect(player.current.z).toBeCloseTo(accepted + MOVE_SPEED * STEP * 9, 6);
    expect(player.correctionCount).toBe(1);
  });

  it('a correção apaga o teleporte, mas mantém o movimento legítimo', () => {
    const player = settled();
    player.step(command({ moveZ: 1 }));
    const acceptedSeq = player.lastSeq;
    const acceptedZ = player.current.z;

    // Mais 5 passos legítimos depois do pacote que o servidor recusou.
    for (let i = 0; i < 5; i += 1) player.step(command({ moveZ: 1 }));

    player.applyCorrection({ seq: acceptedSeq, x: 0, y: 0, z: acceptedZ });
    expect(player.current.z).toBeCloseTo(acceptedZ + MOVE_SPEED * STEP * 5, 6);
    expect(player.current.x).toBeCloseTo(0, 6);
  });

  it('sem o comando no histórico, apenas reposiciona', () => {
    const player = settled();
    player.applyCorrection({ seq: 9999, x: 3, y: 0, z: -4 });
    expect(player.current.x).toBeCloseTo(3, 6);
    expect(player.current.z).toBeCloseTo(-4, 6);
    expect(player.current.vx).toBe(0);
  });

  it('a correção de seq 0 reaplica todo o histórico guardado', () => {
    const player = new PredictedPlayer(spawnPhysics(0, 0, 0), FLOOR);
    for (let i = 0; i < 5; i += 1) player.step(command({ moveX: 1 }));
    player.applyCorrection({ seq: 0, x: 10, y: 0, z: 0 });
    expect(player.current.x).toBeCloseTo(10 + MOVE_SPEED * STEP * 5, 4);
  });

  it('não deixa o histórico crescer sem limite', () => {
    const player = new PredictedPlayer(spawnPhysics(0, 0, 0), FLOOR, 10);
    for (let i = 0; i < 100; i += 1) player.step(command({ moveX: 1 }));
    // Só os 10 últimos comandos podem ser reaplicados.
    player.applyCorrection({ seq: 95, x: 0, y: 0, z: 0 });
    expect(player.current.x).toBeCloseTo(MOVE_SPEED * STEP * 5, 4);
  });
});

describe('PredictedPlayer.teleport (renascer)', () => {
  it('leva o jogador ao ponto, sem velocidade', () => {
    const player = settled();
    for (let i = 0; i < 20; i += 1) player.step(command({ moveZ: 1 }));
    expect(player.current.vz).toBeGreaterThan(0);

    player.teleport(7, 0, -3, 1.2);
    expect(player.current.x).toBe(7);
    expect(player.current.z).toBe(-3);
    expect(player.current.yaw).toBe(1.2);
    expect(player.current.vx).toBe(0);
    expect(player.current.vz).toBe(0);
  });

  it('esquece os comandos de antes: uma correção velha não o arrasta de volta', () => {
    const player = settled();
    for (let i = 0; i < 30; i += 1) player.step(command({ moveX: 1 }));
    const seqAntiga = player.lastSeq - 10;

    player.teleport(0, 0, 0, 0);
    // Chega uma correção atrasada, de antes do renascer: sem histórico, só
    // reposiciona, em vez de reaplicar 10 comandos de caminhada a partir do ponto novo.
    player.applyCorrection({ seq: seqAntiga, x: 0, y: 0, z: 0 });
    expect(player.current.x).toBeCloseTo(0, 6);
  });
});
