import { conectar, migrar, urlDoBanco } from '../db/index.js';
import { MemoryStore } from './memory.js';
import { PostgresStore } from './postgres.js';
import type { PlayerStore } from './types.js';

export * from './types.js';
export { MemoryStore } from './memory.js';
export { PostgresStore } from './postgres.js';

/**
 * Quem guarda o progresso. É um singleton porque a sala do Colyseus é criada
 * pelo servidor e não recebe parâmetros nossos.
 */
let atual: PlayerStore = new MemoryStore();

export function obterStore(): PlayerStore {
  return atual;
}

/** Trocado nos testes para apontar para um banco de teste ou para a memória. */
export function definirStore(store: PlayerStore): void {
  atual = store;
}

/**
 * Liga no Postgres se houver `DATABASE_URL`, aplicando as migrações. Sem banco
 * ou com banco fora do ar, segue em memória e avisa: é melhor um jogo que roda
 * e esquece do que um servidor que não sobe.
 */
export async function inicializarStore(): Promise<PlayerStore> {
  const url = urlDoBanco();
  if (!url) {
    console.warn('DATABASE_URL não definida: progresso só em memória.');
    return atual;
  }

  try {
    const conexao = conectar(url);
    await migrar(conexao);
    atual = new PostgresStore(conexao);
    console.log('Progresso persistente no Postgres.');
  } catch (erro) {
    console.error('Banco indisponível, seguindo em memória:', erro);
  }
  return atual;
}
