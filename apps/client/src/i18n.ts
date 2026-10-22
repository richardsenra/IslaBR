/** Textos de interface (não de conteúdo). Só pt-BR por enquanto (SPEC §2). */
const ptBR = {
  connecting: 'Conectando…',
  disconnected: 'Desconectado',
  playerCount: (n: number) => (n === 1 ? '1 jogador' : `${n} jogadores`),
  offline: 'Sozinho (sem servidor)',
  controls:
    'WASD andar · Espaço pular · Shift esquivar (passa por vãos baixos) · Mouse gira a câmera · Roda aproxima',
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
