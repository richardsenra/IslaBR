import { itemsById, type Item } from '@islabr/content';

/**
 * Inventário em grade simples com empilhamento (SPEC §6). Os nomes e as
 * descrições vêm do `content`; o servidor é quem decide o que cada item faz, e
 * este painel só mostra e pede ("usar o item X").
 */

/** Cor do quadrado de cada tipo, no lugar de um ícone de verdade. */
const COR_POR_TIPO: Readonly<Record<Item['tipo'], string>> = {
  arma: '#b8b8c8',
  armadura: '#8a9bb0',
  equipamento: '#d4a24c',
  consumivel: '#e86a6a',
  ingrediente: '#7bb661',
  chave: '#ffd23f',
  missao: '#c9a7ff',
  receita: '#e8d5a0',
};

const ORDEM_DOS_TIPOS: readonly Item['tipo'][] = [
  'arma',
  'armadura',
  'equipamento',
  'consumivel',
  'ingrediente',
  'chave',
  'missao',
  'receita',
];

/** Quantas casas a grade mostra, ocupadas ou não. */
const CASAS = 20;
const COLUNAS = 5;

export interface Pilha {
  readonly item: Item;
  readonly qtd: number;
}

/** Itens que o jogador tem, em ordem estável: por tipo e depois por nome. */
export function pilhasDe(itens: Readonly<Record<string, number>>): Pilha[] {
  const pilhas: Pilha[] = [];
  for (const [id, qtd] of Object.entries(itens)) {
    if (qtd <= 0) continue;
    const item = itemsById.get(id);
    // Item que o conteúdo não conhece não aparece, em vez de quebrar a tela.
    if (item) pilhas.push({ item, qtd });
  }
  return pilhas.sort(
    (a, b) =>
      ORDEM_DOS_TIPOS.indexOf(a.item.tipo) - ORDEM_DOS_TIPOS.indexOf(b.item.tipo) ||
      a.item.nome.localeCompare(b.item.nome, 'pt-BR'),
  );
}

/** Dá para usar pelo painel? Quem decide de verdade é o servidor. */
export function usavel(item: Item): boolean {
  return item.tipo === 'consumivel' && item.efeito !== undefined;
}

export class InventoryPanel {
  private pilhas: Pilha[] = [];
  private selecionado: string | null = null;

  constructor(
    private readonly raiz: HTMLElement,
    private readonly grade: HTMLElement,
    private readonly detalhe: HTMLElement,
    private readonly aoUsar: (itemId: string) => void,
  ) {
    this.raiz.hidden = true;
    this.grade.style.setProperty('--colunas', String(COLUNAS));
    this.desenhar();
  }

  get aberto(): boolean {
    return !this.raiz.hidden;
  }

  alternar(): boolean {
    this.raiz.hidden = !this.raiz.hidden;
    return this.aberto;
  }

  fechar(): void {
    this.raiz.hidden = true;
  }

  atualizar(itens: Readonly<Record<string, number>>): void {
    this.pilhas = pilhasDe(itens);
    // Acabou o item que estava selecionado: a seleção vai embora junto.
    if (this.selecionado && !this.pilhas.some((pilha) => pilha.item.id === this.selecionado)) {
      this.selecionado = null;
    }
    this.desenhar();
  }

  /** Mostra um aviso curto no rodapé do painel (por exemplo, "vida cheia"). */
  avisar(texto: string): void {
    this.detalhe.textContent = texto;
  }

  /** Usa o item da casa `indice` (as teclas 1 a 9), se for usável. */
  usarCasa(indice: number): void {
    const pilha = this.pilhas[indice];
    if (pilha) this.escolher(pilha);
  }

  private escolher(pilha: Pilha): void {
    this.selecionado = pilha.item.id;
    if (usavel(pilha.item)) {
      this.aoUsar(pilha.item.id);
    } else {
      this.mostrarDetalhe(pilha);
    }
    this.desenhar();
  }

  private mostrarDetalhe(pilha: Pilha): void {
    this.detalhe.textContent = `${pilha.item.nome}: ${pilha.item.descricao}`;
  }

  private desenhar(): void {
    this.grade.replaceChildren();

    for (let i = 0; i < CASAS; i += 1) {
      const casa = document.createElement('button');
      casa.type = 'button';
      casa.className = 'casa';
      const pilha = this.pilhas[i];

      if (!pilha) {
        casa.disabled = true;
        this.grade.appendChild(casa);
        continue;
      }

      const { item, qtd } = pilha;
      casa.title = `${item.nome}: ${item.descricao}`;
      casa.style.setProperty('--cor', COR_POR_TIPO[item.tipo]);
      casa.classList.toggle('selecionada', item.id === this.selecionado);
      casa.classList.toggle('usavel', usavel(item));

      const sigla = document.createElement('span');
      sigla.className = 'sigla';
      sigla.textContent = item.nome.slice(0, 2).toUpperCase();
      casa.appendChild(sigla);

      if (i < 9) {
        const atalho = document.createElement('span');
        atalho.className = 'atalho';
        atalho.textContent = String(i + 1);
        casa.appendChild(atalho);
      }
      if (qtd > 1) {
        const quantidade = document.createElement('span');
        quantidade.className = 'qtd';
        quantidade.textContent = String(qtd);
        casa.appendChild(quantidade);
      }

      casa.addEventListener('click', () => {
        this.escolher(pilha);
      });
      this.grade.appendChild(casa);
    }

    const escolhida = this.pilhas.find((pilha) => pilha.item.id === this.selecionado);
    if (escolhida) this.mostrarDetalhe(escolhida);
    else if (this.pilhas.length === 0) this.detalhe.textContent = 'Você ainda não tem nada.';
    else this.detalhe.textContent = 'Passe o mouse ou clique num item para ver o que ele faz.';
  }
}
