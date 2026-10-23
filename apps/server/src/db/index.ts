import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';

/**
 * Conexão com o Postgres. O jogo roda sem banco: sem `DATABASE_URL` o servidor
 * guarda o progresso em memória e avisa. Isso mantém `pnpm dev` e os testes
 * funcionando em máquina sem Docker.
 */

export type Db = NodePgDatabase<typeof schema>;

export interface Conexao {
  readonly db: Db;
  readonly pool: pg.Pool;
}

export function urlDoBanco(): string | undefined {
  const url = process.env['DATABASE_URL'];
  return url && url.length > 0 ? url : undefined;
}

export function conectar(url: string): Conexao {
  const pool = new pg.Pool({ connectionString: url });
  return { db: drizzle(pool, { schema }), pool };
}

const pastaDeMigracoes = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** Aplica as migrações pendentes; seguro de chamar em toda partida. */
export async function migrar(conexao: Conexao): Promise<void> {
  await migrate(conexao.db, { migrationsFolder: pastaDeMigracoes });
}
