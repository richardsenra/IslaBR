import { eq } from 'drizzle-orm';
import {
  STARTING_PROGRESS,
  type PlayerProgress,
  type QuestBook,
  type QuestState,
} from '@islabr/shared';
import type { Conexao } from '../db/index.js';
import {
  badges,
  chestsOpened,
  inventory,
  players,
  progress as progressTable,
  quests,
} from '../db/schema.js';
import type { JogadorSalvo, PlayerStore } from './types.js';

/**
 * Progresso no Postgres (SPEC §5).
 *
 * O jogador é achado pelo token de convidado; conta de verdade fica para
 * depois (SPEC §4). Salvar reescreve as linhas daquele jogador dentro de uma
 * transação: são poucas linhas e assim o banco nunca fica com meio estado.
 */
export class PostgresStore implements PlayerStore {
  readonly tipo = 'postgres';

  constructor(private readonly conexao: Conexao) {}

  async carregar(guestToken: string): Promise<JogadorSalvo> {
    const { db } = this.conexao;

    const [jogador] = await db
      .insert(players)
      .values({ guestToken })
      .onConflictDoNothing({ target: players.guestToken })
      .returning();

    const id =
      jogador?.id ??
      (
        await db
          .select({ id: players.id })
          .from(players)
          .where(eq(players.guestToken, guestToken))
          .limit(1)
      )[0]?.id;

    if (!id) throw new Error('não deu para criar nem achar o jogador');

    const [linhaProgresso] = await db
      .select()
      .from(progressTable)
      .where(eq(progressTable.playerId, id))
      .limit(1);

    if (!linhaProgresso) {
      await db.insert(progressTable).values({
        playerId: id,
        hearts: STARTING_PROGRESS.coracoes,
        heartsMax: STARTING_PROGRESS.coracoesMax,
      });
      return { id, progress: STARTING_PROGRESS, book: {} };
    }

    const [itens, insignias, baus, missoes] = await Promise.all([
      db.select().from(inventory).where(eq(inventory.playerId, id)),
      db.select().from(badges).where(eq(badges.playerId, id)),
      db.select().from(chestsOpened).where(eq(chestsOpened.playerId, id)),
      db.select().from(quests).where(eq(quests.playerId, id)),
    ]);

    const inventario: Record<string, number> = {};
    for (const linha of itens) {
      if (linha.qty > 0) inventario[linha.itemId] = linha.qty;
    }

    const book: Record<string, QuestState> = {};
    for (const linha of missoes) {
      book[linha.questId] = {
        status: statusValido(linha.status),
        stepIndex: linha.stepIndex,
        counters: contadoresValidos(linha.counters),
      };
    }

    return {
      id,
      progress: {
        moedas: linhaProgresso.coins,
        joias: linhaProgresso.gems,
        coracoes: linhaProgresso.hearts,
        coracoesMax: linhaProgresso.heartsMax,
        itens: inventario,
        insignias: insignias.map((linha) => linha.badgeId),
        bausAbertos: baus.map((linha) => linha.chestId),
      },
      book,
    };
  }

  async salvar(id: string, progress: PlayerProgress, book: QuestBook): Promise<void> {
    await this.conexao.db.transaction(async (tx) => {
      await tx
        .update(progressTable)
        .set({
          coins: progress.moedas,
          gems: progress.joias,
          hearts: progress.coracoes,
          heartsMax: progress.coracoesMax,
        })
        .where(eq(progressTable.playerId, id));

      // Inventário muda para os dois lados, então é reescrito inteiro.
      await tx.delete(inventory).where(eq(inventory.playerId, id));
      const linhasInventario = Object.entries(progress.itens)
        .filter(([, qty]) => qty > 0)
        .map(([itemId, qty]) => ({ playerId: id, itemId, qty }));
      if (linhasInventario.length > 0) await tx.insert(inventory).values(linhasInventario);

      // Insígnia e baú aberto só crescem: inserir ignorando o que já existe.
      if (progress.insignias.length > 0) {
        await tx
          .insert(badges)
          .values(progress.insignias.map((badgeId) => ({ playerId: id, badgeId })))
          .onConflictDoNothing();
      }
      if (progress.bausAbertos.length > 0) {
        await tx
          .insert(chestsOpened)
          .values(progress.bausAbertos.map((chestId) => ({ playerId: id, chestId })))
          .onConflictDoNothing();
      }

      for (const [questId, estado] of Object.entries(book)) {
        await tx
          .insert(quests)
          .values({
            playerId: id,
            questId,
            status: estado.status,
            stepIndex: estado.stepIndex,
            counters: estado.counters,
          })
          .onConflictDoUpdate({
            target: [quests.playerId, quests.questId],
            set: {
              status: estado.status,
              stepIndex: estado.stepIndex,
              counters: estado.counters,
            },
          });
      }
    });
  }

  async encerrar(): Promise<void> {
    await this.conexao.pool.end();
  }
}

/** O banco é texto livre; aqui ele volta a ser o tipo do motor de missões. */
function statusValido(valor: string): QuestState['status'] {
  return valor === 'active' || valor === 'done' ? valor : 'locked';
}

function contadoresValidos(valor: unknown): Record<string, number> {
  if (typeof valor !== 'object' || valor === null) return {};
  const saida: Record<string, number> = {};
  for (const [chave, numero] of Object.entries(valor as Record<string, unknown>)) {
    if (typeof numero === 'number' && Number.isFinite(numero)) saida[chave] = numero;
  }
  return saida;
}
