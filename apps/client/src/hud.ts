import { getItem } from '@islabr/content';
import type { InventoryUpdatePayload, LootPayload, QuestUpdatePayload } from '@islabr/shared';
import { ui } from './i18n.js';

/**
 * HUD (SPEC §6): corações, moedas e joias, objetivo da missão ativa e um aviso
 * curto do que acabou de entrar no inventário. Minimapa e chat ficam para
 * depois.
 */
export class Hud {
  private sumirLoot: number | null = null;

  constructor(
    private readonly elementos: {
      readonly players: HTMLElement;
      readonly debug: HTMLElement;
      readonly help: HTMLElement;
      readonly carteira: HTMLElement;
      readonly objetivo: HTMLElement;
      readonly loot: HTMLElement;
    },
    lagMs: number,
  ) {
    this.elementos.help.textContent = lagMs > 0 ? `${ui.controls} · ${ui.lag(lagMs)}` : ui.controls;
    this.elementos.objetivo.hidden = true;
    this.elementos.loot.hidden = true;
  }

  setStatus(text: string): void {
    this.elementos.players.textContent = text;
  }

  setPlayerCount(count: number): void {
    this.elementos.players.textContent = ui.playerCount(count);
  }

  setDebug(info: {
    fps: number;
    state: string;
    x: number;
    y: number;
    z: number;
    corrections: number;
    draws: number;
  }): void {
    this.elementos.debug.textContent = ui.debug(info);
  }

  setCarteira(inventario: InventoryUpdatePayload): void {
    const cheios = Math.floor(inventario.coracoes);
    const meio = inventario.coracoes - cheios >= 0.5 ? 1 : 0;
    const vazios = Math.max(inventario.coracoesMax - cheios - meio, 0);
    const coracoes = '♥'.repeat(cheios) + (meio ? '♡' : '') + '·'.repeat(vazios);
    this.elementos.carteira.textContent = `${coracoes}  ${inventario.moedas} ⬤  ${inventario.joias} ◆`;
  }

  setObjetivo(update: QuestUpdatePayload | null): void {
    if (!update || update.concluida) {
      this.elementos.objetivo.hidden = true;
      return;
    }
    const contagem = update.total > 1 ? ` (${update.feito}/${update.total})` : '';
    this.elementos.objetivo.hidden = false;
    this.elementos.objetivo.textContent = `${update.titulo}: ${update.texto}${contagem}`;
  }

  mostrarLoot(loot: LootPayload): void {
    const partes: string[] = [];
    if (loot.moedas > 0) partes.push(`${loot.moedas} moedas`);
    if (loot.joias > 0) partes.push(loot.joias === 1 ? '1 joia' : `${loot.joias} joias`);
    for (const item of loot.itens) partes.push(getItem(item).nome);
    if (partes.length === 0) return;

    this.elementos.loot.hidden = false;
    this.elementos.loot.textContent = `Você recebeu: ${partes.join(', ')}`;
    if (this.sumirLoot !== null) window.clearTimeout(this.sumirLoot);
    this.sumirLoot = window.setTimeout(() => {
      this.elementos.loot.hidden = true;
    }, 4000);
  }
}
