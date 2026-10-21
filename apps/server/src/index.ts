import { DEFAULT_SERVER_PORT } from '@islabr/shared';
import { createGameServer } from './app.js';

const port = Number(process.env['PORT'] ?? DEFAULT_SERVER_PORT);
const server = createGameServer();

await server.listen(port);
console.log(`IslaBR server ouvindo na porta ${port}`);
