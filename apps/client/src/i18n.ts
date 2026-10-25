/** Textos de interface (não de conteúdo). Só pt-BR por enquanto (SPEC §2). */
const ptBR = {
  connecting: 'Conectando…',
  loading: 'Carregando os modelos…',
  disconnected: 'Desconectado',
  caiu: 'Você caiu! Voltando ao ponto de partida.',
  /** Por que o servidor recusou usar um item. */
  avisos: {
    'nao-tem': 'Você não tem esse item.',
    'nao-usavel': 'Esse item não se usa assim.',
    'vida-cheia': 'Sua vida já está cheia.',
  } as const,
  playerCount: (n: number) => (n === 1 ? '1 jogador' : `${n} jogadores`),
  offline: 'Sozinho (sem servidor)',
  controls: 'Esc menu e controles · I inventário',
  menu: {
    titulo: 'Pausa',
    abaJogo: 'Jogo',
    abaConfiguracoes: 'Configurações',
    abaControles: 'Controles',
    continuar: 'Continuar',
    dicaEsc: 'O jogo é online: o mundo continua enquanto o menu está aberto.',
    sensibilidade: 'Sensibilidade do mouse',
    inverterY: 'Inverter eixo vertical',
    mostrarDebug: 'Mostrar FPS e depuração',
    qualidade: 'Qualidade gráfica',
    qualidades: { baixa: 'Baixa', media: 'Média', alta: 'Alta' },
    controles: [
      ['W A S D', 'Andar'],
      ['Mouse / Q / E', 'Girar a câmera'],
      ['Roda do mouse', 'Aproximar e afastar'],
      ['Espaço', 'Pular'],
      ['Shift', 'Esquivar'],
      ['Clique / J', 'Atacar (combo de 3)'],
      ['Segurar clique', 'Golpe carregado'],
      ['Clique no ar', 'Mergulho (pulando de um lugar alto)'],
      ['F', 'Falar e abrir'],
      ['I', 'Inventário'],
      ['1 / 2 / 3 / 4', 'Atalhos da barra'],
      ['Esc', 'Menu'],
    ] as const,
  },
  lag: (ms: number) => `latência simulada: ${ms} ms`,
  debug: (info: {
    fps: number;
    state: string;
    x: number;
    y: number;
    z: number;
    corrections: number;
    /** Chamadas de desenho do último quadro (orçamento da SPEC §10). */
    draws: number;
  }) =>
    `${Math.round(info.fps)} fps · ${info.state} · ` +
    `x ${info.x.toFixed(1)} y ${info.y.toFixed(1)} z ${info.z.toFixed(1)} · ` +
    `correções: ${info.corrections} · ${info.draws} desenhos`,
};

export const ui = ptBR;
