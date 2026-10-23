import { STARTING_PROGRESS, type PlayerProgress, type QuestBook } from '@islabr/shared';
import type { JogadorSalvo, PlayerStore } from './types.js';

/**
 * Progresso em memória, para rodar sem banco. O que foi feito vale enquanto o
 * servidor estiver de pé: reconectar na mesma sessão mantém, reiniciar perde.
 */
export class MemoryStore implements PlayerStore {
  readonly tipo = 'memoria';

  private readonly porToken = new Map<string, JogadorSalvo>();

  async carregar(guestToken: string): Promise<JogadorSalvo> {
    const existente = this.porToken.get(guestToken);
    if (existente) return existente;

    const novo: JogadorSalvo = {
      id: `mem_${guestToken}`,
      progress: STARTING_PROGRESS,
      book: {},
    };
    this.porToken.set(guestToken, novo);
    return novo;
  }

  async salvar(id: string, progress: PlayerProgress, book: QuestBook): Promise<void> {
    for (const [token, salvo] of this.porToken) {
      if (salvo.id !== id) continue;
      this.porToken.set(token, { id, progress, book });
      return;
    }
  }

  async encerrar(): Promise<void> {
    this.porToken.clear();
  }
}
