import { ui } from './i18n.js';
import { joinIsland } from './network.js';
import { createScene } from './scene.js';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Elemento #${id} não encontrado`);
  return el as T;
}

const playerCount = byId<HTMLSpanElement>('player-count');

createScene(byId<HTMLCanvasElement>('game'));

playerCount.textContent = ui.connecting;
joinIsland({
  onPlayerCount: (n) => (playerCount.textContent = ui.playerCount(n)),
  onDisconnect: () => (playerCount.textContent = ui.disconnected),
}).catch((err: unknown) => {
  console.error(err);
  playerCount.textContent = ui.disconnected;
});
