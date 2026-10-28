import type { BossPayload } from '@islabr/shared';

/**
 * Barra de vida do Tentáculo-Guardião, no alto da tela, com a fase e o aviso da
 * janela de dano. Aparece só enquanto há luta.
 */
export class BarraDoChefe {
  private readonly cheia: HTMLElement;
  private readonly rotulo: HTMLElement;

  constructor(private readonly raiz: HTMLElement) {
    this.rotulo = document.createElement('div');
    this.rotulo.className = 'chefe-rotulo';
    const trilho = document.createElement('div');
    trilho.className = 'chefe-trilho';
    this.cheia = document.createElement('div');
    this.cheia.className = 'chefe-cheia';
    trilho.append(this.cheia);
    this.raiz.replaceChildren(this.rotulo, trilho);
    this.raiz.hidden = true;
  }

  atualizar(luta: BossPayload): void {
    if (!luta.ativa) {
      this.raiz.hidden = true;
      return;
    }
    this.raiz.hidden = false;
    const fracao = Math.max(0, Math.min(1, luta.hp / luta.hpMax));
    this.cheia.style.width = `${Math.round(fracao * 100)}%`;
    const janela = luta.fase === 1 && luta.janela > 0 ? ' — núcleo exposto!' : '';
    const dica = luta.fase === 1 && luta.janela <= 0 ? ' — corte um tentáculo' : '';
    this.rotulo.textContent = `Tentáculo-Guardião · fase ${luta.fase}${janela}${dica}`;
  }
}
