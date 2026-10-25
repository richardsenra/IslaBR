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
  hud: {
    missao: 'Missão',
    moedas: 'Moedas',
    joias: 'Joias',
    insignias: 'Insígnias da ilha',
    recebeu: 'Você recebeu',
    qtdMoedas: (n: number) => (n === 1 ? '1 moeda' : `${n} moedas`),
    qtdJoias: (n: number) => (n === 1 ? '1 joia' : `${n} joias`),
    coracoes: (atual: number, max: number) =>
      `${String(atual).replace('.', ',')} de ${max} corações`,
  },
  inventario: {
    titulo: 'Inventário',
    dicaTitulo: 'I fecha',
    abas: {
      todos: 'Tudo',
      equipamento: 'Equip.',
      consumiveis: 'Poções',
      materiais: 'Materiais',
      missao: 'Missão',
    },
    tipos: {
      arma: 'Arma',
      armadura: 'Armadura',
      equipamento: 'Equipamento',
      consumivel: 'Consumível',
      ingrediente: 'Ingrediente',
      chave: 'Chave',
      missao: 'Item de missão',
      receita: 'Receita',
    },
    efeitos: {
      dano: (n: number) => `Tira ${n} por golpe`,
      cura: (n: number) =>
        n === 1 ? 'Cura 1 coração' : `Cura ${String(n).replace('.', ',')} corações`,
      curaTudo: 'Cura todos os corações',
      temporarios: (n: number, segundos?: number) =>
        `+${n} corações extras${segundos ? ` por ${segundos} s` : ''}`,
      reduz: 'Diminui o dano que você leva',
      receita: 'Ensina uma receita',
      guardado: 'Não pode ser vendido nem descartado',
    },
    usar: 'Usar',
    semNada: 'Você ainda não tem nada.',
    dica: 'Passe o mouse num item para ver o que ele faz. Dois cliques usam.',
  },
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
