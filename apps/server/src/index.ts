import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SERVER_PORT } from '@islabr/shared';
import { createGameServer } from './app.js';
import { itemsById } from '@islabr/content';
import { definirKitDeTeste } from './rooms/kitDeTeste.js';
import { inicializarStore } from './store/index.js';

// `apps/server/.env` é o jeito de apontar o banco sem exportar variável a cada
// vez. No Docker as variáveis vêm do compose e este arquivo nem existe.
const arquivoEnv = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(arquivoEnv)) process.loadEnvFile(arquivoEnv);

const port = Number(process.env['PORT'] ?? DEFAULT_SERVER_PORT);

// Kit de teste: ids de item separados por vírgula, dados a quem entra na sala.
// Id que o conteúdo não conhece é ignorado, com aviso, em vez de dar item fantasma.
const pedidos = (process.env['ISLABR_KIT_DE_TESTE'] ?? '')
  .split(',')
  .map((id) => id.trim())
  .filter((id) => id.length > 0);
const kit = pedidos.filter((id) => itemsById.has(id));
for (const id of pedidos) {
  if (!itemsById.has(id)) console.warn(`ISLABR_KIT_DE_TESTE: item desconhecido, ignorado: ${id}`);
}
if (kit.length > 0) {
  definirKitDeTeste(kit);
  console.log(`Kit de teste ligado: ${kit.join(', ')}`);
}

// O banco entra antes das salas: quem conectar já encontra o progresso.
await inicializarStore();

const server = createGameServer();
await server.listen(port);
console.log(`IslaBR server ouvindo na porta ${port}`);
