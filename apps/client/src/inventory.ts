import { itemsById, type Item } from '@islabr/content';
import { ui } from './i18n.js';
import { ICONE_DO_TIPO } from './icones.js';

/**
 * Inventário em grade simples com empilhamento (SPEC §6). Os nomes e as
 * descrições vêm do `content`; o servidor é quem decide o que cada item faz, e
 * este painel só mostra e pede ("usar o item X").
 */

/** Cor de fundo da casa de cada tipo, atrás do ícone. */
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

/** Abas do painel: cada uma junta alguns tipos de item. */
type Aba = 'todos' | 'equipamento' | 'consumiveis' | 'materiais' | 'missao';

const TIPOS_DA_ABA: Readonly<Record<Exclude<Aba, 'todos'>, readonly Item['tipo'][]>> = {
  equipamento: ['arma', 'armadura', 'equipamento'],
  consumiveis: ['consumivel'],
  materiais: ['ingrediente', 'receita'],
  missao: ['chave', 'missao'],
};

const ABAS: readonly Aba[] = ['todos', 'equipamento', 'consumiveis', 'materiais', 'missao'];

/** O que o item faz, em frases curtas, a partir do efeito no conteúdo. */
export function efeitosDe(item: Item): string[] {
  const t = ui.inventario.efeitos;
  const e = item.efeito;
  const linhas: string[] = [];
  if (e?.dano !== undefined) linhas.push(t.dano(e.dano));
  if (e?.cura_tudo) linhas.push(t.curaTudo);
  else if (e?.cura_coracoes !== undefined) linhas.push(t.cura(e.cura_coracoes));
  if (e?.coracoes_temporarios !== undefined) {
    linhas.push(t.temporarios(e.coracoes_temporarios, e.duracao_s));
  }
  if (e?.reduz_dano !== undefined) linhas.push(t.reduz);
  if (e?.ensina_receita !== undefined) linhas.push(t.receita);
  if (!item.vendavel && !item.descartavel) linhas.push(t.guardado);
  return linhas;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  classe: string,
  texto?: string,
): HTMLElementTagNameMap[K] {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

export class InventoryPanel {
  private pilhas: Pilha[] = [];
  private selecionado: string | null = null;
  private aba: Aba = 'todos';
  /** Item sob o mouse: o detalhe mostra este enquanto o mouse estiver em cima. */
  private sobOMouse: string | null = null;
  private aviso: string | null = null;
  /** Arma na mão agora, como o servidor diz. */
  private equipada: string | null = null;

  constructor(
    private readonly raiz: HTMLElement,
    private readonly abas: HTMLElement,
    private readonly grade: HTMLElement,
    private readonly detalhe: HTMLElement,
    private readonly aoUsar: (itemId: string) => void,
    private readonly aoEquipar: (itemId: string) => void,
  ) {
    this.raiz.hidden = true;
    this.grade.style.setProperty('--colunas', String(COLUNAS));
    this.montarAbas();
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

  atualizar(itens: Readonly<Record<string, number>>, equipada: string | null): void {
    this.pilhas = pilhasDe(itens);
    this.equipada = equipada;
    // Acabou o item que estava selecionado: a seleção vai embora junto.
    if (this.selecionado && !this.pilhas.some((pilha) => pilha.item.id === this.selecionado)) {
      this.selecionado = null;
    }
    this.desenhar();
  }

  /** Mostra um aviso curto no painel (por exemplo, "vida cheia"). */
  avisar(texto: string): void {
    this.aviso = texto;
    this.desenharDetalhe();
  }

  private visiveis(): Pilha[] {
    if (this.aba === 'todos') return this.pilhas;
    const tipos = TIPOS_DA_ABA[this.aba];
    return this.pilhas.filter((pilha) => tipos.includes(pilha.item.tipo));
  }

  private montarAbas(): void {
    this.abas.replaceChildren();
    for (const aba of ABAS) {
      const botao = el('button', 'aba', ui.inventario.abas[aba]);
      botao.type = 'button';
      botao.dataset['aba'] = aba;
      botao.addEventListener('click', () => {
        this.aba = aba;
        this.desenhar();
      });
      this.abas.appendChild(botao);
    }
  }

  private desenhar(): void {
    for (const botao of this.abas.querySelectorAll<HTMLElement>('.aba')) {
      botao.classList.toggle('ativa', botao.dataset['aba'] === this.aba);
    }

    this.grade.replaceChildren();
    const visiveis = this.visiveis();
    for (let i = 0; i < CASAS; i += 1) {
      const casa = el('button', 'casa');
      casa.type = 'button';
      const pilha = visiveis[i];

      if (!pilha) {
        casa.disabled = true;
        this.grade.appendChild(casa);
        continue;
      }

      const { item, qtd } = pilha;
      casa.style.setProperty('--cor', COR_POR_TIPO[item.tipo]);
      casa.classList.toggle('selecionada', item.id === this.selecionado);
      casa.classList.toggle('usavel', usavel(item));
      casa.classList.toggle('equipada', item.id === this.equipada);
      casa.setAttribute('aria-label', item.nome);

      const icone = el('span', 'casa-icone');
      icone.innerHTML = ICONE_DO_TIPO[item.tipo];
      casa.appendChild(icone);
      if (qtd > 1) casa.appendChild(el('span', 'qtd', String(qtd)));
      if (item.id === this.equipada) casa.appendChild(el('span', 'marca-equipada', 'E'));

      casa.addEventListener('click', () => {
        this.selecionado = item.id;
        this.aviso = null;
        this.desenhar();
      });
      // Dois cliques usam direto, sem passar pelo botão.
      casa.addEventListener('dblclick', () => {
        if (usavel(item)) this.aoUsar(item.id);
        else if (item.tipo === 'arma') this.aoEquipar(item.id);
      });
      casa.addEventListener('mouseenter', () => {
        this.sobOMouse = item.id;
        this.desenharDetalhe();
      });
      casa.addEventListener('mouseleave', () => {
        if (this.sobOMouse === item.id) this.sobOMouse = null;
        this.desenharDetalhe();
      });
      this.grade.appendChild(casa);
    }
    this.desenharDetalhe();
  }

  private desenharDetalhe(): void {
    const t = ui.inventario;
    const id = this.sobOMouse ?? this.selecionado;
    const pilha = this.pilhas.find((p) => p.item.id === id);
    this.detalhe.replaceChildren();

    if (!pilha) {
      const texto = this.aviso ?? (this.pilhas.length === 0 ? t.semNada : t.dica);
      this.detalhe.appendChild(el('p', 'detalhe-vazio', texto));
      return;
    }

    const { item, qtd } = pilha;
    const topo = el('div', 'detalhe-topo');
    const icone = el('span', 'detalhe-icone');
    icone.style.setProperty('--cor', COR_POR_TIPO[item.tipo]);
    icone.innerHTML = ICONE_DO_TIPO[item.tipo];
    const nomes = el('div', '');
    nomes.append(
      el('div', 'detalhe-nome', qtd > 1 ? `${item.nome} ×${qtd}` : item.nome),
      el('div', 'detalhe-tipo', t.tipos[item.tipo]),
    );
    topo.append(icone, nomes);
    this.detalhe.append(topo, el('p', 'detalhe-descricao', item.descricao));

    const efeitos = efeitosDe(item);
    if (efeitos.length > 0) {
      const lista = el('ul', 'detalhe-efeitos');
      for (const efeito of efeitos) lista.appendChild(el('li', '', efeito));
      this.detalhe.appendChild(lista);
    }

    const selecionado = item.id === this.selecionado;
    if (this.aviso && selecionado) this.detalhe.appendChild(el('p', 'detalhe-aviso', this.aviso));

    if (item.tipo === 'arma') {
      if (item.id === this.equipada) {
        this.detalhe.appendChild(el('p', 'detalhe-equipada', t.naMao));
      } else if (selecionado) {
        const equipar = el('button', 'botao botao-principal', t.equipar);
        equipar.type = 'button';
        equipar.addEventListener('click', () => this.aoEquipar(item.id));
        this.detalhe.appendChild(equipar);
      }
    }

    if (usavel(item) && selecionado) {
      const usar = el('button', 'botao botao-principal', t.usar);
      usar.type = 'button';
      usar.addEventListener('click', () => this.aoUsar(item.id));
      this.detalhe.appendChild(usar);
    }
  }
}
