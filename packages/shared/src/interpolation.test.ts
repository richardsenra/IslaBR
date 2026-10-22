import { describe, expect, it } from 'vitest';
import { SnapshotBuffer, type RemoteSnapshot } from './interpolation.js';
import { INTERP_DELAY_MS, SERVER_TICK_MS } from './net.js';

function snapshot(t: number, x: number, partial: Partial<RemoteSnapshot> = {}): RemoteSnapshot {
  return { t, x, y: 0, z: 0, yaw: 0, state: 'run', ...partial };
}

describe('SnapshotBuffer', () => {
  it('sem pacote nenhum, não devolve pose', () => {
    expect(new SnapshotBuffer().sample(1000)).toBeNull();
  });

  it('interpola entre dois pacotes', () => {
    const buffer = new SnapshotBuffer();
    buffer.push(snapshot(1000, 0));
    buffer.push(snapshot(1100, 10));

    // Com 100 ms de atraso, em t = 1150 desenha o instante 1050: meio caminho.
    const pose = buffer.sample(1150, 100);
    expect(pose?.x).toBeCloseTo(5, 6);
  });

  it('segura o pacote mais novo quando o fluxo atrasa', () => {
    const buffer = new SnapshotBuffer();
    buffer.push(snapshot(1000, 0));
    buffer.push(snapshot(1100, 10));
    const pose = buffer.sample(5000, 100);
    expect(pose?.x).toBeCloseTo(10, 6);
  });

  it('segura o primeiro pacote enquanto o atraso não passou', () => {
    const buffer = new SnapshotBuffer();
    buffer.push(snapshot(1000, 7));
    expect(buffer.sample(1050, 100)?.x).toBeCloseTo(7, 6);
  });

  it('usa o estado do pacote que explica o movimento', () => {
    const buffer = new SnapshotBuffer();
    buffer.push(snapshot(1000, 0, { state: 'idle' }));
    buffer.push(snapshot(1100, 10, { state: 'run' }));
    expect(buffer.sample(1150, 100)?.state).toBe('run');
  });

  it('interpola o yaw pelo caminho curto', () => {
    const buffer = new SnapshotBuffer();
    buffer.push(snapshot(1000, 0, { yaw: Math.PI - 0.1 }));
    buffer.push(snapshot(1100, 0, { yaw: -Math.PI + 0.1 }));
    const pose = buffer.sample(1150, 100);
    expect(Math.abs(pose?.yaw ?? 0)).toBeCloseTo(Math.PI, 6);
  });

  it('ignora pacote que chega fora de ordem', () => {
    const buffer = new SnapshotBuffer();
    buffer.push(snapshot(1100, 10));
    buffer.push(snapshot(1000, 0));
    expect(buffer.size).toBe(1);
  });

  it('descarta pacotes velhos, mas nunca o par em uso', () => {
    const buffer = new SnapshotBuffer();
    for (let i = 0; i < 200; i += 1) {
      buffer.push(snapshot(1000 + i * SERVER_TICK_MS, i));
    }
    expect(buffer.size).toBeLessThan(30);
    expect(buffer.sample(1000 + 199 * SERVER_TICK_MS)).not.toBeNull();
  });

  it('a 100 ms de latência, o movimento sai suave e sem salto', () => {
    // Jogador andando a 5,5 m/s, pacotes a 20 Hz chegando 100 ms depois.
    const buffer = new SnapshotBuffer();
    const latency = 100;
    const speed = 5.5;
    const frameMs = 1000 / 60;
    const arrivals = Array.from({ length: 60 }, (_, i) => ({
      at: i * SERVER_TICK_MS + latency,
      x: (speed * i * SERVER_TICK_MS) / 1000,
    }));

    // Chegada e desenho acontecem intercalados, como no laço do cliente.
    const steps: number[] = [];
    let pending = 0;
    let previous: number | null = null;
    for (let frame = 0; frame < 120; frame += 1) {
      const now = frame * frameMs;
      while (pending < arrivals.length && (arrivals[pending]?.at ?? Infinity) <= now) {
        const arrival = arrivals[pending];
        if (arrival) buffer.push(snapshot(arrival.at, arrival.x));
        pending += 1;
      }
      const pose = buffer.sample(now);
      if (!pose || now < latency + INTERP_DELAY_MS) continue;
      if (previous !== null) steps.push(pose.x - previous);
      previous = pose.x;
    }

    const expected = (speed * frameMs) / 1000;
    expect(steps.length).toBeGreaterThan(50);
    for (const step of steps) {
      // Nenhum quadro anda muito mais nem muito menos que o esperado.
      expect(step).toBeGreaterThan(expected * 0.5);
      expect(step).toBeLessThan(expected * 1.5);
    }
  });
});
