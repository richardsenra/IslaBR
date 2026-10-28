import { content, getItem } from '@islabr/content';
import type { InventoryUpdatePayload } from '@islabr/shared';

/**
 * Painéis de balcão: a loja do Seu Bento e a bancada do Zé Calango. O servidor
 * abre o painel (mensagem `panel`) e confere cada compra ou fabricação; aqui só
 * se desenha a lista e se manda o pedido. Preço e receita saem do conteúdo.
 */

export type TipoDePainel = 'loja' | 'bancada';

interface Callbacks {
  comprar(item: string): void;
  fabricar(receita: string): void;
}

export class Painel {
  private tipo: TipoDePainel | null = null;
  private inventario: InventoryUpdatePayload | null = null;
  private readonly lista: HTMLElement;
  private readonly titulo: HTMLElement;

  constructor(
    private readonly raiz: HTMLElement,
    private readonly callbacks: Callbacks,
  ) {
    this.titulo = document.createElement('div');
    this.titulo.className = 'painel-titulo';
    this.lista = document.createElement('div');
    this.lista.className = 'painel-lista';
    const fechar = document.createElement('button');
    fechar.className = 'painel-fechar';
    fechar.textContent = 'Fechar (Esc)';
    fechar.addEventListener('click', () => {
      this.fechar();
    });
    this.raiz.replaceChildren(this.titulo, this.lista, fechar);
    this.raiz.hidden = true;
  }

  get aberto(): boolean {
    return this.tipo !== null;
  }

  abrir(tipo: TipoDePainel): void {
    this.tipo = tipo;
    this.raiz.hidden = false;
    this.desenhar();
  }

  fechar(): void {
    this.tipo = null;
    this.raiz.hidden = true;
  }

  /** Chegou inventário novo: refaz a lista para os botões refletirem o bolso. */
  atualizar(inventario: InventoryUpdatePayload): void {
    this.inventario = inventario;
    if (this.tipo) this.desenhar();
  }

  private qtd(item: string): number {
    return this.inventario?.itens[item] ?? 0;
  }

  private desenhar(): void {
    const linhas: HTMLElement[] = [];
    if (this.tipo === 'loja') {
      this.titulo.textContent = 'Loja do Seu Bento';
      for (const entrada of content.shop.itens) {
        const { moedas, joias, itens } = entrada.custo;
        const partes: string[] = [];
        if (moedas > 0) partes.push(`${moedas} moedas`);
        if (joias > 0) partes.push(`${joias} joia${joias > 1 ? 's' : ''}`);
        for (const exigido of itens) partes.push(`${exigido.qtd}× ${getItem(exigido.item).nome}`);
        const pode =
          (this.inventario?.moedas ?? 0) >= moedas &&
          (this.inventario?.joias ?? 0) >= joias &&
          itens.every((exigido) => this.qtd(exigido.item) >= exigido.qtd);
        linhas.push(
          this.linha(getItem(entrada.item).nome, partes.join(' + '), 'Comprar', pode, () => {
            this.callbacks.comprar(entrada.item);
          }),
        );
      }
    } else if (this.tipo === 'bancada') {
      this.titulo.textContent = 'Bancada do Zé Calango';
      for (const receita of content.recipes) {
        const ingredientes = receita.ingredientes
          .map((ing) => `${ing.qtd}× ${getItem(ing.item).nome} (${this.qtd(ing.item)})`)
          .join(' + ');
        const pode = receita.ingredientes.every((ing) => this.qtd(ing.item) >= ing.qtd);
        linhas.push(
          this.linha(getItem(receita.resultado.item).nome, ingredientes, 'Fabricar', pode, () => {
            this.callbacks.fabricar(receita.id);
          }),
        );
      }
    }
    this.lista.replaceChildren(...linhas);
  }

  private linha(
    nome: string,
    detalhe: string,
    rotulo: string,
    habilitado: boolean,
    aoClicar: () => void,
  ): HTMLElement {
    const linha = document.createElement('div');
    linha.className = 'painel-linha';
    const texto = document.createElement('div');
    texto.className = 'painel-texto';
    const forte = document.createElement('strong');
    forte.textContent = nome;
    const fraco = document.createElement('span');
    fraco.textContent = detalhe;
    texto.append(forte, fraco);
    const botao = document.createElement('button');
    botao.textContent = rotulo;
    botao.disabled = !habilitado;
    botao.addEventListener('click', aoClicar);
    linha.append(texto, botao);
    return linha;
  }
}
