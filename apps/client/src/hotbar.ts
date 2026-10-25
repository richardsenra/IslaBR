import { ICONE_DO_TIPO } from './icones.js';
import { pilhasDe, usavel, type Pilha } from './inventory.js';

/** Quantas casas a barra tem, nas teclas 1 a 4. */
export const CASAS_DA_BARRA = 4;

/**
 * Barra de atalhos no rodapé: os itens usáveis que o jogador tem, na mesma
 * ordem do inventário, nas teclas 1 a 4. Assim dá para beber uma poção no meio
 * da briga sem abrir o painel. Quem decide se o item faz efeito é o servidor.
 */
export class Hotbar {
  private casas: (Pilha | undefined)[] = [];

  constructor(
    private readonly raiz: HTMLElement,
    private readonly aoUsar: (itemId: string) => void,
  ) {
    this.desenhar();
  }

  atualizar(itens: Readonly<Record<string, number>>): void {
    const usaveis = pilhasDe(itens).filter((pilha) => usavel(pilha.item));
    this.casas = Array.from({ length: CASAS_DA_BARRA }, (_, i) => usaveis[i]);
    this.desenhar();
  }

  /** Tecla 1 a 4: usa o que estiver naquela casa, se houver. */
  usar(indice: number): void {
    const pilha = this.casas[indice];
    if (!pilha) return;
    this.aoUsar(pilha.item.id);
    const casa = this.raiz.children[indice];
    if (casa instanceof HTMLElement) {
      casa.classList.remove('usou');
      void casa.offsetWidth;
      casa.classList.add('usou');
    }
  }

  private desenhar(): void {
    this.raiz.replaceChildren();
    for (let i = 0; i < CASAS_DA_BARRA; i += 1) {
      const pilha = this.casas[i];
      const casa = document.createElement('div');
      casa.className = pilha ? 'atalho-casa' : 'atalho-casa vazia';

      const tecla = document.createElement('span');
      tecla.className = 'atalho-tecla';
      tecla.textContent = String(i + 1);
      casa.appendChild(tecla);

      if (pilha) {
        casa.title = pilha.item.nome;
        const icone = document.createElement('span');
        icone.className = 'atalho-icone';
        icone.innerHTML = ICONE_DO_TIPO[pilha.item.tipo];
        casa.appendChild(icone);
        const qtd = document.createElement('span');
        qtd.className = 'atalho-qtd';
        qtd.textContent = String(pilha.qtd);
        casa.appendChild(qtd);
      }
      this.raiz.appendChild(casa);
    }
  }
}
