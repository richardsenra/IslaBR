import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SERVER_PORT } from '@islabr/shared';
import { createGameServer } from './app.js';
import { inicializarStore } from './store/index.js';

// `apps/server/.env` é o jeito de apontar o banco sem exportar variável a cada
// vez. No Docker as variáveis vêm do compose e este arquivo nem existe.
const arquivoEnv = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(arquivoEnv)) process.loadEnvFile(arquivoEnv);

const port = Number(process.env['PORT'] ?? DEFAULT_SERVER_PORT);

// O banco entra antes das salas: quem conectar já encontra o progresso.
await inicializarStore();

const server = createGameServer();
await server.listen(port);
console.log(`IslaBR server ouvindo na porta ${port}`);
