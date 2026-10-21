/** Textos de interface (não de conteúdo). Só pt-BR por enquanto (SPEC §2). */
const ptBR = {
  connecting: 'Conectando…',
  disconnected: 'Desconectado',
  playerCount: (n: number) => (n === 1 ? '1 jogador' : `${n} jogadores`),
};

export const ui = ptBR;
