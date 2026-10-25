import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { STARTING_PROGRESS, type PlayerProgress, type QuestBook } from '@islabr/shared';
import { conectar, migrar, urlDoBanco } from '../db/index.js';
import { MemoryStore } from './memory.js';
import { PostgresStore } from './postgres.js';
import type { PlayerStore } from './types.js';

/** Um jogador no meio da m02, com bolso, insígnia e baú aberto. */
const PROGRESSO: PlayerProgress = {
  moedas: 25,
  joias: 1,
  coracoes: 2.5,
  coracoesMax: 4,
  itens: { graveto_reforcado: 1, pocao_pequena: 2 },
  insignias: ['b01'],
  bausAbertos: ['c01'],
  armaEquipada: 'graveto_reforcado',
};

const LIVRO: QuestBook = {
  m01: { status: 'done', stepIndex: 2, counters: { p0: 1, p1: 1, p2: 1 } },
  m02: { status: 'active', stepIndex: 0, counters: { 'p0.spot_caixa_1': 1 } },
};

let proximo = 0;
function token(prefixo: string): string {
  proximo += 1;
  return `${prefixo}_${Date.now()}_${proximo}`;
}

/** A mesma bateria roda nas duas implementações. */
function testarStore(nome: string, montar: () => Promise<PlayerStore>): void {
  describe(nome, () => {
    let store: PlayerStore | undefined;
    const usar = (): PlayerStore => {
      if (!store) throw new Error('store não foi montado');
      return store;
    };

    beforeAll(async () => {
      store = await montar();
    });

    afterAll(async () => {
      await store?.encerrar();
    });

    it('jogador novo começa do zero', async () => {
      const salvo = await usar().carregar(token('novo'));
      expect(salvo.progress).toEqual(STARTING_PROGRESS);
      expect(salvo.book).toEqual({});
      expect(salvo.id.length).toBeGreaterThan(0);
    });

    it('o mesmo token volta no mesmo jogador', async () => {
      const mesmo = token('mesmo');
      const primeira = await usar().carregar(mesmo);
      const segunda = await usar().carregar(mesmo);
      expect(segunda.id).toBe(primeira.id);
    });

    it('salva e devolve tudo que foi guardado', async () => {
      const meu = token('cheio');
      const { id } = await usar().carregar(meu);

      await usar().salvar(id, PROGRESSO, LIVRO);
      const devolta = await usar().carregar(meu);

      expect(devolta.id).toBe(id);
      expect(devolta.progress.moedas).toBe(25);
      expect(devolta.progress.joias).toBe(1);
      expect(devolta.progress.coracoes).toBe(2.5);
      expect(devolta.progress.coracoesMax).toBe(4);
      expect(devolta.progress.itens).toEqual(PROGRESSO.itens);
      expect(devolta.progress.insignias).toEqual(['b01']);
      expect(devolta.progress.bausAbertos).toEqual(['c01']);
      expect(devolta.book).toEqual(LIVRO);
    });

    it('salvar de novo substitui o inventário em vez de somar', async () => {
      const meu = token('troca');
      const { id } = await usar().carregar(meu);

      await usar().salvar(id, PROGRESSO, LIVRO);
      await usar().salvar(id, { ...PROGRESSO, itens: { erva: 3 } }, LIVRO);

      const devolta = await usar().carregar(meu);
      expect(devolta.progress.itens).toEqual({ erva: 3 });
    });

    it('missão que avança sobrescreve o estado antigo', async () => {
      const meu = token('avanca');
      const { id } = await usar().carregar(meu);

      await usar().salvar(id, PROGRESSO, LIVRO);
      await usar().salvar(id, PROGRESSO, {
        ...LIVRO,
        m02: { status: 'done', stepIndex: 1, counters: { p0: 5, p1: 1 } },
      });

      const devolta = await usar().carregar(meu);
      expect(devolta.book['m02']).toEqual({
        status: 'done',
        stepIndex: 1,
        counters: { p0: 5, p1: 1 },
      });
    });

    it('o progresso de um jogador não vaza para outro', async () => {
      const comProgresso = token('cheio2');
      const semNada = token('vazio');
      const { id } = await usar().carregar(comProgresso);
      await usar().salvar(id, PROGRESSO, LIVRO);

      const outro = await usar().carregar(semNada);
      expect(outro.progress.moedas).toBe(0);
      expect(outro.book).toEqual({});
    });
  });
}

testarStore('MemoryStore', async () => new MemoryStore());

// O teste do Postgres só roda com DATABASE_URL apontando para um banco.
const url = urlDoBanco();
if (url) {
  testarStore('PostgresStore (banco de verdade)', async () => {
    const conexao = conectar(url);
    await migrar(conexao);
    return new PostgresStore(conexao);
  });
} else {
  describe.skip('PostgresStore', () => {
    it('pulado: defina DATABASE_URL para rodar contra um banco', () => {
      expect(url).toBeUndefined();
    });
  });
}
