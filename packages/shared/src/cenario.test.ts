import { describe, expect, it } from 'vitest';
import { content } from '@islabr/content';
import { ARENA_LIMITE } from './arena.js';
import { colocacoesDoCenario, espalhar, type Obstaculo } from './cenario.js';

const dispersao = {
  id: 't',
  minX: 0,
  maxX: 20,
  minZ: 0,
  maxZ: 20,
  modelos: ['Bush_Common', 'Fern_1'],
  quantidade: 40,
  semente: 7,
  escala: [0.5, 1] as [number, number],
  folga: 0.5,
};

describe('espalhar', () => {
  it('com a mesma semente sai igual', () => {
    expect(espalhar(dispersao, [])).toEqual(espalhar(dispersao, []));
  });

  it('fica dentro do retângulo, com escala no intervalo', () => {
    for (const c of espalhar(dispersao, [])) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThanOrEqual(20);
      expect(c.z).toBeGreaterThanOrEqual(0);
      expect(c.z).toBeLessThanOrEqual(20);
      expect(c.escala).toBeGreaterThanOrEqual(0.5);
      expect(c.escala).toBeLessThanOrEqual(1);
    }
  });

  it('não nasce em cima de obstáculo, respeitando a folga', () => {
    const parede: Obstaculo = { x: 10, z: 10, meioX: 4, meioZ: 4 };
    const lista = espalhar(dispersao, [parede]);
    expect(lista.length).toBeGreaterThan(0);
    for (const c of lista) {
      const dentro = Math.abs(c.x - 10) < 4.5 && Math.abs(c.z - 10) < 4.5;
      expect(dentro).toBe(false);
    }
  });
});

describe('cenário da ilha', () => {
  it('só usa modelos de nomes válidos e fica dentro da ilha (mais a faixa de árvores)', () => {
    const todas = colocacoesDoCenario();
    expect(todas.length).toBeGreaterThan(0);
    for (const c of todas) {
      expect(Math.abs(c.x)).toBeLessThan(ARENA_LIMITE + 15);
      expect(Math.abs(c.z)).toBeLessThan(ARENA_LIMITE + 15);
    }
  });

  it('as dispersões têm ids únicos', () => {
    const ids = content.world.dispersoes.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
