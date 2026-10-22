import { ui } from './i18n.js';

/** HUD mínimo do M1: contagem de jogadores, depuração e ajuda das teclas. */
export class Hud {
  constructor(
    private readonly playersEl: HTMLElement,
    private readonly debugEl: HTMLElement,
    private readonly helpEl: HTMLElement,
    lagMs: number,
  ) {
    this.helpEl.textContent = lagMs > 0 ? `${ui.controls} · ${ui.lag(lagMs)}` : ui.controls;
  }

  setStatus(text: string): void {
    this.playersEl.textContent = text;
  }

  setPlayerCount(count: number): void {
    this.playersEl.textContent = ui.playerCount(count);
  }

  setDebug(info: {
    fps: number;
    state: string;
    x: number;
    y: number;
    z: number;
    corrections: number;
  }): void {
    this.debugEl.textContent = ui.debug(info);
  }
}
