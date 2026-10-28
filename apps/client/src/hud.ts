import { badgesById, getBadge, getItem } from '@islabr/content';
import type { InventoryUpdatePayload, LootPayload, QuestUpdatePayload } from '@islabr/shared';
import { ui } from './i18n.js';
import { ICONES } from './icones.js';

/**
 * HUD (SPEC §6): corações no canto superior esquerdo, moedas, joias e
 * insígnias logo abaixo, objetivo da missão ativa e um aviso curto do que
 * acabou de entrar no inventário. Minimapa e chat ficam para depois.
 */
export class Hud {
  private sumirLoot: number | null = null;
  private coracoesAntes: number | null = null;

  constructor(
    private readonly elementos: {
      readonly players: HTMLElement;
      readonly debug: HTMLElement;
      readonly help: HTMLElement;
      readonly coracoes: HTMLElement;
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
    if (this.elementos.debug.hidden) return;
    this.elementos.debug.textContent = ui.debug(info);
  }

  setCarteira(inventario: InventoryUpdatePayload): void {
    this.desenharCoracoes(inventario.coracoes, inventario.coracoesMax);

    const { carteira } = this.elementos;
    carteira.replaceChildren(
      contador('moedas', ICONES.moeda, String(inventario.moedas), ui.hud.moedas),
      contador('joias', ICONES.joia, String(inventario.joias), ui.hud.joias),
      contador(
        'insignias',
        ICONES.insignia,
        `${inventario.insignias}/${badgesById.size}`,
        ui.hud.insignias,
      ),
    );
  }

  private desenharCoracoes(coracoes: number, maximo: number): void {
    const el = this.elementos.coracoes;
    const total = Math.max(maximo, Math.ceil(coracoes));
    el.replaceChildren();
    for (let i = 0; i < total; i += 1) {
      const resto = coracoes - i;
      const estado = resto >= 1 ? 'cheio' : resto >= 0.5 ? 'meio' : 'vazio';
      const coracao = document.createElement('span');
      coracao.className = `coracao ${estado}`;
      // Os corações acima do máximo são os emprestados da Poção Heróica.
      if (i >= maximo) coracao.classList.add('extra');
      coracao.innerHTML = ICONES.coracao;
      el.append(coracao);
    }
    el.title = ui.hud.coracoes(coracoes, maximo);

    // Perdeu vida: os corações tremem um instante.
    if (this.coracoesAntes !== null && coracoes < this.coracoesAntes) {
      el.classList.remove('perdeu');
      void el.offsetWidth;
      el.classList.add('perdeu');
    }
    this.coracoesAntes = coracoes;
  }

  setObjetivo(update: QuestUpdatePayload | null): void {
    const el = this.elementos.objetivo;
    if (!update || update.concluida) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const rotulo = texto('div', 'objetivo-rotulo', ui.hud.missao);
    const titulo = texto('div', 'objetivo-titulo', update.titulo);
    const corpo = texto('div', 'objetivo-texto', update.texto);
    el.replaceChildren(rotulo, titulo, corpo);

    if (update.total > 1) {
      const barra = texto('div', 'objetivo-barra');
      const cheia = texto('div', 'objetivo-barra-cheia');
      cheia.style.width = `${Math.round((update.feito / update.total) * 100)}%`;
      barra.append(cheia);
      el.append(barra, texto('div', 'objetivo-conta', `${update.feito}/${update.total}`));
    }
  }

  mostrarLoot(loot: LootPayload): void {
    const partes: { icone: string; nome: string }[] = [];
    if (loot.moedas > 0) partes.push({ icone: ICONES.moeda, nome: ui.hud.qtdMoedas(loot.moedas) });
    if (loot.joias > 0) partes.push({ icone: ICONES.joia, nome: ui.hud.qtdJoias(loot.joias) });
    for (const item of loot.itens) partes.push({ icone: ICONES.item, nome: getItem(item).nome });
    for (const id of loot.insignias ?? []) {
      partes.push({ icone: ICONES.insignia, nome: `${ui.hud.insignia}: ${getBadge(id).feito}` });
    }
    if (partes.length === 0) return;

    const el = this.elementos.loot;
    el.hidden = false;
    el.replaceChildren(texto('div', 'loot-titulo', ui.hud.recebeu));
    for (const parte of partes) {
      const linha = texto('div', 'loot-linha');
      const icone = texto('span', 'icone');
      icone.innerHTML = parte.icone;
      linha.append(icone, texto('span', '', parte.nome));
      el.append(linha);
    }
    // Reinicia a animação de entrada a cada loot novo.
    el.classList.remove('entrando');
    void el.offsetWidth;
    el.classList.add('entrando');

    if (this.sumirLoot !== null) window.clearTimeout(this.sumirLoot);
    this.sumirLoot = window.setTimeout(() => {
      el.hidden = true;
    }, 4000);
  }
}

function texto(tag: string, classe: string, conteudo?: string): HTMLElement {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (conteudo !== undefined) el.textContent = conteudo;
  return el;
}

function contador(classe: string, icone: string, valor: string, titulo: string): HTMLElement {
  const el = texto('span', `contador ${classe}`);
  el.title = titulo;
  const img = texto('span', 'icone');
  img.innerHTML = icone;
  el.append(img, texto('span', 'contador-valor', valor));
  return el;
}
