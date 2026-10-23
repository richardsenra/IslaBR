/** Textos de interface (não de conteúdo). Só pt-BR por enquanto (SPEC §2). */
const ptBR = {
  connecting: 'Conectando…',
  loading: 'Carregando os modelos…',
  disconnected: 'Desconectado',
  caiu: 'Você caiu! Levantando em instantes…',
  /** Por que o servidor recusou usar um item. */
  avisos: {
    'nao-tem': 'Você não tem esse item.',
    'nao-usavel': 'Esse item não se usa assim.',
    'vida-cheia': 'Sua vida já está cheia.',
    caido: 'Você não consegue usar isso caído.',
  } as const,
  playerCount: (n: number) => (n === 1 ? '1 jogador' : `${n} jogadores`),
  offline: 'Sozinho (sem servidor)',
  controls:
    'WASD andar · Espaço pular · Shift esquivar · Clique ou J atacar (segure para carregar) · F falar e abrir · I inventário · Mouse ou Q/E giram a câmera',
  lag: (ms: number) => `latência simulada: ${ms} ms`,
  debug: (info: {
    fps: number;
    state: string;
    x: number;
    y: number;
    z: number;
    corrections: number;
  }) =>
    `${Math.round(info.fps)} fps · ${info.state} · ` +
    `x ${info.x.toFixed(1)} y ${info.y.toFixed(1)} z ${info.z.toFixed(1)} · ` +
    `correções: ${info.corrections}`,
};

export const ui = ptBR;
