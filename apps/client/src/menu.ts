import { ui } from './i18n.js';
import {
  SENSIBILIDADE_MAX,
  SENSIBILIDADE_MIN,
  salvarConfiguracoes,
  type Configuracoes,
  type Qualidade,
} from './settings.js';

type Aba = 'jogo' | 'configuracoes' | 'controles';

/**
 * Menu do Esc: continuar, configurações e lista de controles. O jogo é online,
 * então não pausa de verdade: só para de ler o teclado e o mouse enquanto o
 * menu está aberto.
 */
export class PauseMenu {
  private config: Configuracoes;
  private aba: Aba = 'jogo';

  constructor(
    private readonly raiz: HTMLElement,
    inicial: Configuracoes,
    private readonly aoMudar: (config: Configuracoes) => void,
    private readonly aoContinuar: () => void,
  ) {
    this.config = inicial;
    this.montar();
    this.fechar();
  }

  get aberto(): boolean {
    return !this.raiz.hidden;
  }

  abrir(): void {
    this.raiz.hidden = false;
    this.mostrarAba('jogo');
  }

  fechar(): void {
    this.raiz.hidden = true;
  }

  private mudar(parcial: Partial<Configuracoes>): void {
    this.config = { ...this.config, ...parcial };
    salvarConfiguracoes(this.config);
    this.aoMudar(this.config);
  }

  private mostrarAba(aba: Aba): void {
    this.aba = aba;
    for (const el of this.raiz.querySelectorAll<HTMLElement>('[data-aba]')) {
      el.classList.toggle('ativa', el.dataset['aba'] === this.aba);
    }
    for (const el of this.raiz.querySelectorAll<HTMLElement>('[data-secao]')) {
      el.hidden = el.dataset['secao'] !== this.aba;
    }
  }

  private montar(): void {
    const t = ui.menu;
    const painel = elemento('div', 'menu-painel');
    painel.append(elemento('h2', 'menu-titulo', t.titulo));

    const abas = elemento('div', 'menu-abas');
    const rotulos: Record<Aba, string> = {
      jogo: t.abaJogo,
      configuracoes: t.abaConfiguracoes,
      controles: t.abaControles,
    };
    for (const aba of ['jogo', 'configuracoes', 'controles'] as const) {
      const botao = elemento('button', 'menu-aba', rotulos[aba]);
      botao.dataset['aba'] = aba;
      botao.addEventListener('click', () => this.mostrarAba(aba));
      abas.append(botao);
    }
    painel.append(abas);

    // Jogo: só voltar.
    const jogo = secao('jogo');
    const continuar = elemento('button', 'botao botao-principal', t.continuar);
    continuar.addEventListener('click', () => this.aoContinuar());
    jogo.append(continuar, elemento('p', 'menu-dica', t.dicaEsc));
    painel.append(jogo);

    // Configurações.
    const cfg = secao('configuracoes');

    const valorSens = elemento('span', 'menu-valor', formatarSens(this.config.sensibilidade));
    const sens = document.createElement('input');
    sens.type = 'range';
    sens.min = String(SENSIBILIDADE_MIN);
    sens.max = String(SENSIBILIDADE_MAX);
    sens.step = '0.05';
    sens.value = String(this.config.sensibilidade);
    sens.addEventListener('input', () => {
      const valor = Number(sens.value);
      valorSens.textContent = formatarSens(valor);
      this.mudar({ sensibilidade: valor });
    });
    cfg.append(linha(t.sensibilidade, sens, valorSens));

    cfg.append(
      linha(
        t.inverterY,
        caixa(this.config.inverterY, (v) => this.mudar({ inverterY: v })),
      ),
    );
    cfg.append(
      linha(
        t.mostrarDebug,
        caixa(this.config.mostrarDebug, (v) => this.mudar({ mostrarDebug: v })),
      ),
    );

    const qualidade = document.createElement('select');
    for (const q of ['baixa', 'media', 'alta'] as const) {
      const opcao = document.createElement('option');
      opcao.value = q;
      opcao.textContent = t.qualidades[q];
      qualidade.append(opcao);
    }
    qualidade.value = this.config.qualidade;
    qualidade.addEventListener('change', () => {
      this.mudar({ qualidade: qualidade.value as Qualidade });
    });
    cfg.append(linha(t.qualidade, qualidade));
    painel.append(cfg);

    // Controles.
    const ctl = secao('controles');
    const lista = elemento('dl', 'menu-controles');
    for (const [tecla, acao] of t.controles) {
      const dt = document.createElement('dt');
      for (const parte of tecla.split(' / ')) dt.append(elemento('kbd', '', parte));
      lista.append(dt, elemento('dd', '', acao));
    }
    ctl.append(lista);
    painel.append(ctl);

    this.raiz.append(painel);
  }
}

function elemento<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  classe: string,
  texto?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

function secao(nome: Aba): HTMLElement {
  const el = elemento('div', 'menu-secao');
  el.dataset['secao'] = nome;
  return el;
}

function linha(rotulo: string, ...controles: HTMLElement[]): HTMLElement {
  const el = elemento('label', 'menu-linha');
  el.append(elemento('span', 'menu-rotulo', rotulo), ...controles);
  return el;
}

function caixa(marcada: boolean, aoMudar: (valor: boolean) => void): HTMLInputElement {
  const el = document.createElement('input');
  el.type = 'checkbox';
  el.checked = marcada;
  el.addEventListener('change', () => aoMudar(el.checked));
  return el;
}

function formatarSens(valor: number): string {
  return `${valor.toFixed(2).replace('.', ',')}×`;
}
