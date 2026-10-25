/**
 * Preferências do jogador neste navegador: mouse, depuração e qualidade.
 * Não são progresso de jogo, então ficam no `localStorage`, não no servidor.
 */

export type Qualidade = 'baixa' | 'media' | 'alta';

export interface Configuracoes {
  /** Multiplicador da sensibilidade do mouse, de 0,25 a 3. */
  readonly sensibilidade: number;
  readonly inverterY: boolean;
  /** Linha de fps, posição e desenhos no canto da tela. */
  readonly mostrarDebug: boolean;
  readonly qualidade: Qualidade;
}

export const PADRAO: Configuracoes = {
  sensibilidade: 1,
  inverterY: false,
  mostrarDebug: false,
  qualidade: 'alta',
};

export const SENSIBILIDADE_MIN = 0.25;
export const SENSIBILIDADE_MAX = 3;

const CHAVE = 'islabr.configuracoes';

/** Lê o que estiver salvo, corrigindo o que vier torto, em vez de quebrar. */
export function carregarConfiguracoes(): Configuracoes {
  let salvo: unknown = null;
  try {
    const texto = localStorage.getItem(CHAVE);
    salvo = texto ? JSON.parse(texto) : null;
  } catch {
    // Navegador sem localStorage (aba anônima, bloqueio): fica o padrão.
  }
  return normalizar(salvo);
}

export function salvarConfiguracoes(config: Configuracoes): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(config));
  } catch {
    // Sem onde salvar, a preferência vale só até recarregar a página.
  }
}

export function normalizar(raw: unknown): Configuracoes {
  if (typeof raw !== 'object' || raw === null) return PADRAO;
  const dado = raw as Record<string, unknown>;
  const sens = dado['sensibilidade'];
  const qualidade = dado['qualidade'];
  return {
    sensibilidade:
      typeof sens === 'number' && Number.isFinite(sens)
        ? Math.min(Math.max(sens, SENSIBILIDADE_MIN), SENSIBILIDADE_MAX)
        : PADRAO.sensibilidade,
    inverterY: typeof dado['inverterY'] === 'boolean' ? dado['inverterY'] : PADRAO.inverterY,
    mostrarDebug:
      typeof dado['mostrarDebug'] === 'boolean' ? dado['mostrarDebug'] : PADRAO.mostrarDebug,
    qualidade:
      qualidade === 'baixa' || qualidade === 'media' || qualidade === 'alta'
        ? qualidade
        : PADRAO.qualidade,
  };
}

/** Resolução da renderização para cada qualidade, em pixels por pixel de tela. */
export function pixelRatioDa(qualidade: Qualidade, dispositivo: number): number {
  if (qualidade === 'baixa') return 0.6;
  if (qualidade === 'media') return 1;
  return Math.min(dispositivo, 2);
}
