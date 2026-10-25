import type { Item } from '@islabr/content';

/**
 * Ícones da interface, desenhados em SVG aqui mesmo: arte própria e simples,
 * no traço cartoon do jogo, até haver ícones de verdade (CLAUDE.md: nada do
 * MilMo). Contorno escuro grosso e cor chapada com um brilho.
 *
 * São textos fixos, sem nada vindo de fora, então podem ir para `innerHTML`.
 */

const CONTORNO = '#2a1d33';

function svg(conteudo: string): string {
  return `<svg viewBox="0 0 32 32" aria-hidden="true" stroke-linejoin="round" stroke-linecap="round">${conteudo}</svg>`;
}

const CORACAO_PATH =
  'M16 27 C6 20 3 14.5 3 10.5 C3 6.6 6 4 9.4 4 C12.2 4 14.6 5.7 16 8.2 C17.4 5.7 19.8 4 22.6 4 C26 4 29 6.6 29 10.5 C29 14.5 26 20 16 27 Z';

export const ICONES = {
  /**
   * Coração em duas camadas: o fundo vazio e o cheio por cima. O CSS recorta o
   * cheio pela metade para o meio coração.
   */
  coracao: svg(
    `<path class="fundo" d="${CORACAO_PATH}" fill="#4a2b3a" stroke="${CONTORNO}" stroke-width="2.5"/>` +
      `<g class="cheio"><path d="${CORACAO_PATH}" fill="#ff4d6d" stroke="${CONTORNO}" stroke-width="2.5"/>` +
      `<path d="M8 9.5 C8.5 7.8 10 7 11.5 7.2" fill="none" stroke="#ffd1da" stroke-width="2.2"/></g>`,
  ),
  moeda: svg(
    `<circle cx="16" cy="16" r="12" fill="#ffc531" stroke="${CONTORNO}" stroke-width="2.5"/>` +
      `<circle cx="16" cy="16" r="7.5" fill="none" stroke="#d8960c" stroke-width="2"/>` +
      `<path d="M11 10.5 C12 9.3 13.4 8.7 14.8 8.6" fill="none" stroke="#fff3c4" stroke-width="2"/>`,
  ),
  joia: svg(
    `<path d="M16 28 L4 13 L9 6 H23 L28 13 Z" fill="#3fd0e8" stroke="${CONTORNO}" stroke-width="2.5"/>` +
      `<path d="M4 13 H28 M9 6 L13 13 L16 28 L19 13 L23 6" fill="none" stroke="#1d8aa3" stroke-width="1.6"/>` +
      `<path d="M10 9.5 L11.5 8" stroke="#e6fbff" stroke-width="2"/>`,
  ),
  insignia: svg(
    `<path d="M16 3 L19.6 11 L28 12 L21.6 17.8 L23.4 26.4 L16 22 L8.6 26.4 L10.4 17.8 L4 12 L12.4 11 Z" fill="#b48cff" stroke="${CONTORNO}" stroke-width="2.5"/>` +
      `<circle cx="16" cy="15.5" r="3.4" fill="#ffd23f" stroke="${CONTORNO}" stroke-width="1.6"/>`,
  ),
  item: svg(
    `<rect x="5" y="9" width="22" height="17" rx="3" fill="#d49a5a" stroke="${CONTORNO}" stroke-width="2.5"/>` +
      `<path d="M5 14 H27 M14 14 V18 H18 V14" fill="none" stroke="${CONTORNO}" stroke-width="2"/>` +
      `<path d="M9 9 L11 5 H21 L23 9" fill="#b97c3c" stroke="${CONTORNO}" stroke-width="2.5"/>`,
  ),
} as const;

/** Ícone de cada tipo de item, para a grade do inventário e a barra de atalhos. */
export const ICONE_DO_TIPO: Readonly<Record<Item['tipo'], string>> = {
  arma: svg(
    `<path d="M24.5 4.5 L27.5 7.5 L13 22 L10 19 Z" fill="#dfe6f0" stroke="${CONTORNO}" stroke-width="2.3"/>` +
      `<path d="M7 17 L15 25" stroke="${CONTORNO}" stroke-width="5"/>` +
      `<path d="M7 17 L15 25" stroke="#c9952d" stroke-width="2.5"/>` +
      `<path d="M9.5 22.5 L5 27" stroke="${CONTORNO}" stroke-width="5"/>` +
      `<path d="M9.5 22.5 L5 27" stroke="#8a5a2b" stroke-width="2.5"/>`,
  ),
  armadura: svg(
    `<path d="M16 4 L26 8 V15 C26 21 21.5 25.5 16 28 C10.5 25.5 6 21 6 15 V8 Z" fill="#8fb0d6" stroke="${CONTORNO}" stroke-width="2.5"/>` +
      `<path d="M16 8 V24" stroke="#5c7fa8" stroke-width="2"/>`,
  ),
  equipamento: svg(
    `<circle cx="16" cy="17" r="9" fill="#ffcf5c" stroke="${CONTORNO}" stroke-width="2.5"/>` +
      `<path d="M16 4 V8 M11 6 L13 9 M21 6 L19 9" stroke="${CONTORNO}" stroke-width="2.3"/>` +
      `<circle cx="16" cy="17" r="3.5" fill="#fff4cf" stroke="${CONTORNO}" stroke-width="1.8"/>`,
  ),
  consumivel: svg(
    `<path d="M12.5 4 H19.5 V11 L25 21 C26.5 24 24.5 28 21 28 H11 C7.5 28 5.5 24 7 21 L12.5 11 Z" fill="#f3f0ff" stroke="${CONTORNO}" stroke-width="2.5"/>` +
      `<path d="M8.6 19 H23.4 L25 21.5 C26 24 24.2 26.5 21.3 26.5 H10.7 C7.8 26.5 6 24 7 21.5 Z" fill="#ff5a7a"/>` +
      `<path d="M11.5 4 H20.5" stroke="${CONTORNO}" stroke-width="3"/>`,
  ),
  ingrediente: svg(
    `<path d="M6 25 C6 13 14 6 27 5 C27 18 20 26 6 25 Z" fill="#7bd36a" stroke="${CONTORNO}" stroke-width="2.5"/>` +
      `<path d="M6 25 L19 12" stroke="#3f8f33" stroke-width="2"/>`,
  ),
  chave: svg(
    `<circle cx="10.5" cy="11" r="6" fill="#ffd23f" stroke="${CONTORNO}" stroke-width="2.5"/>` +
      `<circle cx="10.5" cy="11" r="2" fill="#2a1d33"/>` +
      `<path d="M14.5 15 L27 27.5 M21 21.5 L24 18.5 M24.5 25 L27 22.5" stroke="${CONTORNO}" stroke-width="5"/>` +
      `<path d="M14.5 15 L27 27.5 M21 21.5 L24 18.5 M24.5 25 L27 22.5" stroke="#ffd23f" stroke-width="2.4"/>`,
  ),
  missao: svg(
    `<path d="M7 5 H22 L26 9 V27 H7 Z" fill="#f7e7c1" stroke="${CONTORNO}" stroke-width="2.5"/>` +
      `<path d="M11 12 H22 M11 16.5 H22 M11 21 H18" stroke="#b08a4a" stroke-width="2"/>` +
      `<circle cx="22.5" cy="23.5" r="3.5" fill="#e25555" stroke="${CONTORNO}" stroke-width="1.8"/>`,
  ),
  receita: svg(
    `<path d="M5 8 C10 5.5 13.5 6 16 8.5 C18.5 6 22 5.5 27 8 V26 C22 23.5 18.5 24 16 26.5 C13.5 24 10 23.5 5 26 Z" fill="#e8d5a0" stroke="${CONTORNO}" stroke-width="2.5"/>` +
      `<path d="M16 8.5 V26.5" stroke="${CONTORNO}" stroke-width="2"/>`,
  ),
};
