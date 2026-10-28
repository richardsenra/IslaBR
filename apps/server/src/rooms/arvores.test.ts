import { describe, expect, it } from 'vitest';
import { getResource } from '@islabr/content';
import { ARENA_TREES, sorteioComSemente, type TreeSpawn } from '@islabr/shared';
import {
  criarArvore,
  cortar,
  emPe,
  passarOTempo,
  type ArvoreRuntime,
  type Cortador,
} from './arvores.js';

function primeiraArvore(): TreeSpawn {
  const arvore = ARENA_TREES[0];
  if (!arvore) throw new Error('a arena precisa de pelo menos uma árvore');
  return arvore;
}

const PRIMEIRA = primeiraArvore();

/** Um jogador colado na árvore, de frente para ela, com o que estiver na mão. */
function cortador(arma: string | null, arvore = PRIMEIRA): Cortador {
  return { x: arvore.x, y: 0, z: arvore.z - 1, yaw: 0, arma };
}

const arvores = () => [criarArvore(PRIMEIRA)];

/** A única árvore da lista, sem asserção de não-nulo. */
function so(lista: readonly ArvoreRuntime[]): ArvoreRuntime {
  const [primeira] = lista;
  if (!primeira) throw new Error('a lista de árvores está vazia');
  return primeira;
}

describe('cortar árvore', () => {
  it('nasce em pé, com os golpes que o conteúdo diz', () => {
    const arvore = criarArvore(PRIMEIRA);
    expect(emPe(arvore)).toBe(true);
    expect(arvore.golpes).toBe(getResource(PRIMEIRA.tipo).golpes);
  });

  it('sem machado na mão, o golpe não faz nada na árvore', () => {
    const lista = arvores();
    for (const arma of ['arma_nv2', 'graveto_reforcado', null]) {
      expect(cortar(cortador(arma), lista, sorteioComSemente(1)), String(arma)).toBeNull();
    }
    expect(lista[0]?.golpes).toBe(getResource(PRIMEIRA.tipo).golpes);
  });

  it('cada machadada tira um golpe, e a última derruba e larga madeira', () => {
    const lista = arvores();
    const total = getResource(PRIMEIRA.tipo).golpes;
    const sorteio = sorteioComSemente(5);

    for (let golpe = 1; golpe < total; golpe += 1) {
      const acerto = cortar(cortador('machado'), lista, sorteio);
      expect(acerto?.caiu, `golpe ${golpe}`).toBe(false);
      expect(acerto?.saque, `golpe ${golpe}`).toBeNull();
    }

    const ultimo = cortar(cortador('machado'), lista, sorteio);
    expect(ultimo?.caiu).toBe(true);
    expect(ultimo?.saque?.itens).toContain('madeira');
    expect(emPe(so(lista))).toBe(false);
  });

  it('árvore no chão não leva mais golpe: não dá para moer madeira dela', () => {
    const lista = arvores();
    const sorteio = sorteioComSemente(9);
    for (let i = 0; i < getResource(PRIMEIRA.tipo).golpes; i += 1) {
      cortar(cortador('machado'), lista, sorteio);
    }
    expect(cortar(cortador('machado'), lista, sorteio)).toBeNull();
  });

  it('longe ou de costas, a machadada não pega', () => {
    const lista = arvores();
    const longe: Cortador = { ...cortador('machado'), z: PRIMEIRA.z - 6 };
    expect(cortar(longe, lista, sorteioComSemente(1))).toBeNull();
    const deCostas: Cortador = { ...cortador('machado'), yaw: Math.PI };
    expect(cortar(deCostas, lista, sorteioComSemente(1))).toBeNull();
    expect(lista[0]?.golpes).toBe(getResource(PRIMEIRA.tipo).golpes);
  });

  it('o golpe derruba uma de cada vez, mesmo com duas no alcance', () => {
    const outra = { ...PRIMEIRA, id: 'r02_teste', x: PRIMEIRA.x + 0.6 };
    const lista = [criarArvore(PRIMEIRA), criarArvore(outra)];
    const acerto = cortar(cortador('machado'), lista, sorteioComSemente(2));
    expect(acerto).not.toBeNull();
    const mexidas = lista.filter((a) => a.golpes < getResource(a.tipo).golpes);
    expect(mexidas).toHaveLength(1);
  });

  it('volta em pé depois do tempo do conteúdo, e não antes', () => {
    const recurso = getResource(PRIMEIRA.tipo);
    const lista = arvores();
    const sorteio = sorteioComSemente(4);
    for (let i = 0; i < recurso.golpes; i += 1) cortar(cortador('machado'), lista, sorteio);
    expect(emPe(so(lista))).toBe(false);

    expect(passarOTempo(lista, recurso.volta_s - 1)).toEqual([]);
    expect(emPe(so(lista))).toBe(false);

    const voltaram = passarOTempo(lista, 1.5);
    expect(voltaram).toHaveLength(1);
    expect(lista[0]?.golpes).toBe(recurso.golpes);
  });

  it('árvore em pé não é afetada pela passagem do tempo', () => {
    const lista = arvores();
    expect(passarOTempo(lista, 999)).toEqual([]);
    expect(lista[0]?.golpes).toBe(getResource(PRIMEIRA.tipo).golpes);
  });
});
