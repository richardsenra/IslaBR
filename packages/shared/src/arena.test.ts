import { describe, expect, it } from 'vitest';
import { getEnemy, getResource } from '@islabr/content';
import { ARENA_COLLIDERS, ARENA_ENEMIES, ARENA_SPAWN, ARENA_SPOTS, ARENA_TREES } from './arena.js';
import { bodyBox, overlapsAny } from './collision.js';

/** O raio em que o bicho percebe o jogador, vindo do JSON. */
function aggroDe(tipo: string): number {
  const ia = getEnemy(tipo).ia;
  if (!ia) throw new Error(`${tipo} sem ia`);
  return ia.aggro;
}

const distancia = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z);

describe('inimigos da arena', () => {
  it('os ids são únicos', () => {
    const ids = ARENA_ENEMIES.map((spawn) => spawn.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cada tipo existe no conteúdo e tem IA', () => {
    for (const spawn of ARENA_ENEMIES) {
      expect(getEnemy(spawn.tipo).ia, spawn.id).toBeDefined();
    }
  });

  it('a m04 tem caranguejo de sobra: 8 comuns, e há de todos os outros tipos', () => {
    const quantos = (tipo: string): number =>
      ARENA_ENEMIES.filter((spawn) => spawn.tipo === tipo).length;
    expect(quantos('e01')).toBeGreaterThanOrEqual(8);
    for (const tipo of ['e02', 'e03', 'e04', 'e05']) {
      expect(quantos(tipo), tipo).toBeGreaterThanOrEqual(1);
    }
  });

  it('o id do spawn começa com o tipo do bicho', () => {
    for (const spawn of ARENA_ENEMIES) {
      expect(spawn.id.startsWith(`${spawn.tipo}_`), spawn.id).toBe(true);
    }
  });

  it('ficam dentro dos muros e fora de qualquer colisor', () => {
    for (const spawn of ARENA_ENEMIES) {
      expect(Math.abs(spawn.x), spawn.id).toBeLessThan(23);
      expect(Math.abs(spawn.z), spawn.id).toBeLessThan(23);
      // Um corpo de bicho grande, para a conta valer para o sapo e o espinhoso.
      expect(overlapsAny(bodyBox(spawn.x, 0, spawn.z, 0.7, 1), ARENA_COLLIDERS), spawn.id).toBe(
        false,
      );
    }
  });

  it('nenhum acorda perto de NPC, fruta, baú, caixa ou do ponto onde o jogador nasce', () => {
    for (const spawn of ARENA_ENEMIES) {
      const aggro = aggroDe(spawn.tipo);
      expect(distancia(spawn, ARENA_SPAWN), `${spawn.id} x nascimento`).toBeGreaterThan(aggro + 1);
      for (const spot of ARENA_SPOTS) {
        expect(distancia(spawn, spot), `${spawn.id} x ${spot.id}`).toBeGreaterThan(aggro + 0.5);
      }
    }
  });

  it('bichos do mesmo tipo ficam longe o bastante para não serem puxados juntos', () => {
    for (const a of ARENA_ENEMIES) {
      for (const b of ARENA_ENEMIES) {
        if (a.id >= b.id || a.tipo !== b.tipo) continue;
        expect(distancia(a, b), `${a.id} x ${b.id}`).toBeGreaterThan(aggroDe(a.tipo));
      }
    }
  });
});

describe('alvos de interação', () => {
  it('os ids são únicos', () => {
    const ids = ARENA_SPOTS.map((spot) => spot.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('as 6 frutas da m03 e as 5 caixas da m02 existem', () => {
    expect(ARENA_SPOTS.filter((spot) => spot.alvo === 'fruta')).toHaveLength(6);
    expect(ARENA_SPOTS.filter((spot) => spot.alvo === 'caixa_quebravel')).toHaveLength(5);
  });
});

describe('árvores da arena', () => {
  it('os ids são únicos e começam com o tipo', () => {
    const ids = ARENA_TREES.map((tree) => tree.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const tree of ARENA_TREES) {
      expect(tree.id.startsWith(`${tree.tipo}_`), tree.id).toBe(true);
    }
  });

  it('cada tipo existe no conteúdo', () => {
    for (const tree of ARENA_TREES) {
      expect(getResource(tree.tipo).golpes, tree.id).toBeGreaterThan(0);
    }
  });

  it('ficam dentro dos muros e não se encostam', () => {
    for (const tree of ARENA_TREES) {
      expect(Math.abs(tree.x), tree.id).toBeLessThan(23);
      expect(Math.abs(tree.z), tree.id).toBeLessThan(23);
    }
    for (const a of ARENA_TREES) {
      for (const b of ARENA_TREES) {
        if (a.id >= b.id) continue;
        expect(distancia(a, b), `${a.id} x ${b.id}`).toBeGreaterThan(2);
      }
    }
  });

  it('o tronco bloqueia o jogador, mas não nasce dentro de outro colisor', () => {
    // O colisor da árvore entra em ARENA_COLLIDERS: um corpo no lugar dela bate.
    for (const tree of ARENA_TREES) {
      expect(overlapsAny(bodyBox(tree.x, 0, tree.z, 0.4, 1.7), ARENA_COLLIDERS), tree.id).toBe(
        true,
      );
      // Ao lado, longe do tronco, o caminho está livre: nada de árvore em cima de caixa.
      const aoLado = bodyBox(tree.x + 2, 0, tree.z, 0.4, 1.7);
      expect(overlapsAny(aoLado, ARENA_COLLIDERS), `${tree.id} ao lado`).toBe(false);
    }
  });

  it('nenhuma nasce em cima do ponto de partida nem dos bichos', () => {
    for (const tree of ARENA_TREES) {
      expect(distancia(tree, ARENA_SPAWN), `${tree.id} x nascimento`).toBeGreaterThan(2);
      for (const spawn of ARENA_ENEMIES) {
        expect(distancia(tree, spawn), `${tree.id} x ${spawn.id}`).toBeGreaterThan(
          aggroDe(spawn.tipo),
        );
      }
    }
  });

  it('dá para cortar todas: há árvore perto de onde o jogador nasce', () => {
    const perto = ARENA_TREES.filter((tree) => distancia(tree, ARENA_SPAWN) < 12);
    expect(perto.length).toBeGreaterThanOrEqual(2);
  });
});
