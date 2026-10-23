import type { PlayerProgress, QuestBook } from '@islabr/shared';

/**
 * Guarda o progresso de um jogador entre sessões (SPEC §5).
 *
 * Duas implementações: memória, para quem roda sem banco, e Postgres. A sala
 * não sabe qual está em uso.
 */

export interface JogadorSalvo {
  /** Id do jogador no banco, ou um id local na implementação em memória. */
  readonly id: string;
  readonly progress: PlayerProgress;
  readonly book: QuestBook;
}

export interface PlayerStore {
  /** Acha o jogador pelo token de convidado, criando se for a primeira vez. */
  carregar(guestToken: string): Promise<JogadorSalvo>;
  salvar(id: string, progress: PlayerProgress, book: QuestBook): Promise<void>;
  encerrar(): Promise<void>;
  readonly tipo: 'memoria' | 'postgres';
}
