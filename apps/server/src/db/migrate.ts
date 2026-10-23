import { conectar, migrar, urlDoBanco } from './index.js';

/**
 * Aplica as migrações e sai. O servidor também migra ao subir; este script é
 * para rodar a mão, em deploy ou depois de mexer no schema.
 */
const url = urlDoBanco();
if (!url) {
  console.error('Defina DATABASE_URL antes de migrar.');
  process.exit(1);
}

const conexao = conectar(url);
await migrar(conexao);
await conexao.pool.end();
console.log('Migrações aplicadas.');
