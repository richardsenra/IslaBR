/**
 * Sorteio de drops (SPEC §7.7).
 *
 * Quem sorteia é o servidor (SPEC §4 e §10: "o servidor nunca confia em
 * valores do cliente para dano, drop, moedas ou progresso"). O gerador entra
 * por parâmetro para o teste conseguir repetir a mesma sequência.
 */

import type { Drop, Enemy, Resource } from '@islabr/content';

/** Devolve um número em [0, 1). `Math.random` serve. */
export type Sorteio = () => number;

export interface Saque {
  readonly moedas: number;
  readonly itens: readonly string[];
}

const NADA: Saque = { moedas: 0, itens: [] };

/** Inteiro em [min, max], com as duas pontas podendo sair. */
export function inteiroEntre(sorteio: Sorteio, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(sorteio() * (max - min + 1));
}

/** Rola uma linha da tabela de drops. */
export function rolarDrop(drop: Drop, sorteio: Sorteio): Saque {
  if (sorteio() >= drop.chance) return NADA;
  if (drop.tipo === 'moedas') {
    return { moedas: inteiroEntre(sorteio, drop.min, drop.max), itens: [] };
  }
  return { moedas: 0, itens: Array.from({ length: drop.qtd }, () => drop.item) };
}

/**
 * Tudo que um inimigo derrubou. Cada linha da tabela é independente: um
 * caranguejo pode largar moeda e casca na mesma morte.
 */
export function rolarDrops(inimigo: Enemy, sorteio: Sorteio): Saque {
  let moedas = 0;
  const itens: string[] = [];
  for (const drop of inimigo.drops) {
    const saque = rolarDrop(drop, sorteio);
    moedas += saque.moedas;
    itens.push(...saque.itens);
  }
  return { moedas, itens };
}

/** Tudo que um recurso do mundo largou ao cair (árvore e madeira). */
export function rolarDropsDeRecurso(recurso: Resource, sorteio: Sorteio): Saque {
  let moedas = 0;
  const itens: string[] = [];
  for (const drop of recurso.drops) {
    const saque = rolarDrop(drop, sorteio);
    moedas += saque.moedas;
    itens.push(...saque.itens);
  }
  return { moedas, itens };
}

/**
 * Gerador determinístico (mulberry32) para teste e para repetir uma partida.
 * Não serve para nada que precise ser imprevisível.
 */
export function sorteioComSemente(semente: number): Sorteio {
  let estado = semente >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
