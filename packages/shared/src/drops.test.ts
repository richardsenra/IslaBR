import { describe, expect, it } from 'vitest';
import { content, getEnemy } from '@islabr/content';
import { inteiroEntre, rolarDrops, sorteioComSemente, type Sorteio } from './drops.js';

/** Mil mortes do mesmo inimigo, como pede o aceite do M3. */
function simular(inimigoId: string, vezes: number, sorteio: Sorteio) {
  const inimigo = getEnemy(inimigoId);
  const contagem = new Map<string, number>();
  let moedasTotais = 0;
  let mortesComMoeda = 0;

  for (let i = 0; i < vezes; i += 1) {
    const saque = rolarDrops(inimigo, sorteio);
    if (saque.moedas > 0) {
      mortesComMoeda += 1;
      moedasTotais += saque.moedas;
    }
    for (const item of new Set(saque.itens)) {
      contagem.set(item, (contagem.get(item) ?? 0) + 1);
    }
  }

  return {
    vezes,
    moedasTotais,
    taxaDeMoeda: mortesComMoeda / vezes,
    taxaDe: (item: string): number => (contagem.get(item) ?? 0) / vezes,
  };
}

/** Tolerância do aceite: 5 pontos percentuais. */
const TOLERANCIA = 0.05;

describe('drops seguem a tabela da SPEC §7.7 (aceite do M3)', () => {
  it('caranguejo comum: 60% moeda, 40% casca, 10% coração', () => {
    const r = simular('e01', 1000, sorteioComSemente(20261022));
    expect(r.taxaDeMoeda).toBeGreaterThan(0.6 - TOLERANCIA);
    expect(r.taxaDeMoeda).toBeLessThan(0.6 + TOLERANCIA);
    expect(r.taxaDe('casca_caranguejo')).toBeGreaterThan(0.4 - TOLERANCIA);
    expect(r.taxaDe('casca_caranguejo')).toBeLessThan(0.4 + TOLERANCIA);
    expect(r.taxaDe('coracao_pequeno')).toBeGreaterThan(0.1 - TOLERANCIA);
    expect(r.taxaDe('coracao_pequeno')).toBeLessThan(0.1 + TOLERANCIA);
  });

  it('caranguejo espinhoso: 25% casca espinhosa', () => {
    const r = simular('e02', 1000, sorteioComSemente(7));
    expect(r.taxaDe('casca_espinhosa')).toBeGreaterThan(0.25 - TOLERANCIA);
    expect(r.taxaDe('casca_espinhosa')).toBeLessThan(0.25 + TOLERANCIA);
  });

  it('mosquito: 35% ferrão', () => {
    const r = simular('e03', 1000, sorteioComSemente(99));
    expect(r.taxaDe('ferrao')).toBeGreaterThan(0.35 - TOLERANCIA);
    expect(r.taxaDe('ferrao')).toBeLessThan(0.35 + TOLERANCIA);
  });

  it('sapo gosmento: 30% gosma', () => {
    const r = simular('e04', 1000, sorteioComSemente(123));
    expect(r.taxaDe('gosma')).toBeGreaterThan(0.3 - TOLERANCIA);
    expect(r.taxaDe('gosma')).toBeLessThan(0.3 + TOLERANCIA);
  });

  it('água-viva: 30% gel brilhante', () => {
    const r = simular('e05', 1000, sorteioComSemente(4242));
    expect(r.taxaDe('gel_brilhante')).toBeGreaterThan(0.3 - TOLERANCIA);
    expect(r.taxaDe('gel_brilhante')).toBeLessThan(0.3 + TOLERANCIA);
  });

  it('todo inimigo comum larga de 1 a 3 moedas quando larga', () => {
    const r = simular('e01', 1000, sorteioComSemente(31337));
    const mediaQuandoCai = r.moedasTotais / (r.taxaDeMoeda * r.vezes);
    expect(mediaQuandoCai).toBeGreaterThan(1.8);
    expect(mediaQuandoCai).toBeLessThan(2.2);
  });

  it('a tabela de cada inimigo bate com a chance declarada no conteúdo', () => {
    // Em vez de repetir os números, confere contra o próprio content.
    for (const inimigo of content.enemies.filter((e) => e.tipo === 'comum')) {
      const r = simular(inimigo.id, 1000, sorteioComSemente(inimigo.id.charCodeAt(2) * 97));
      for (const drop of inimigo.drops) {
        const observado = drop.tipo === 'moedas' ? r.taxaDeMoeda : r.taxaDe(drop.item);
        expect(
          Math.abs(observado - drop.chance),
          `${inimigo.id} ${JSON.stringify(drop)}`,
        ).toBeLessThan(TOLERANCIA);
      }
    }
  });
});

describe('mini-chefes têm drop fixo (SPEC §7.6)', () => {
  it('Caranguejo-Rei larga 50 moedas sempre', () => {
    const r = simular('mb1', 50, sorteioComSemente(1));
    expect(r.taxaDeMoeda).toBe(1);
    expect(r.moedasTotais).toBe(50 * 50);
  });

  it('Sapo-Ancestral larga a chave da ilhota sempre', () => {
    const r = simular('mb2', 50, sorteioComSemente(2));
    expect(r.taxaDe('chave_ilhota')).toBe(1);
  });
});

describe('sorteio', () => {
  it('a mesma semente dá a mesma sequência', () => {
    const a = sorteioComSemente(42);
    const b = sorteioComSemente(42);
    const primeira = Array.from({ length: 10 }, () => a());
    const segunda = Array.from({ length: 10 }, () => b());
    expect(primeira).toEqual(segunda);
  });

  it('sementes diferentes divergem', () => {
    const a = sorteioComSemente(1);
    const b = sorteioComSemente(2);
    expect(a()).not.toBe(b());
  });

  it('inteiroEntre cobre as duas pontas e nada fora', () => {
    const sorteio = sorteioComSemente(5);
    const vistos = new Set<number>();
    for (let i = 0; i < 500; i += 1) {
      const valor = inteiroEntre(sorteio, 1, 3);
      expect(valor).toBeGreaterThanOrEqual(1);
      expect(valor).toBeLessThanOrEqual(3);
      vistos.add(valor);
    }
    expect([...vistos].sort()).toEqual([1, 2, 3]);
  });

  it('chance 0 nunca cai e chance 1 sempre cai', () => {
    const sorteio = sorteioComSemente(9);
    const nunca = { tipo: 'item', item: 'erva', chance: 0, qtd: 1 } as const;
    const sempre = { tipo: 'item', item: 'erva', chance: 1, qtd: 1 } as const;
    for (let i = 0; i < 100; i += 1) {
      expect(rolarDrops({ ...getEnemy('e01'), drops: [nunca] }, sorteio).itens).toEqual([]);
      expect(rolarDrops({ ...getEnemy('e01'), drops: [sempre] }, sorteio).itens).toEqual(['erva']);
    }
  });
});
