import { describe, expect, it } from 'vitest';
import { content, getQuest, type Quest } from '@islabr/content';
import {
  acceptQuest,
  applyQuestEvent,
  availableQuests,
  canAccept,
  hintFor,
  isDone,
  progressOf,
  questProgress,
  targetOf,
  unlocked,
  type GameEvent,
  type Inventory,
  type QuestBook,
} from './quests.js';

const defs = content.quests;

/** Aplica uma fila de eventos e devolve o livro de missões resultante. */
function play(book: QuestBook, events: readonly GameEvent[], inventory: Inventory = {}): QuestBook {
  return events.reduce(
    (current, event) => applyQuestEvent(defs, current, event, inventory).book,
    book,
  );
}

function accept(book: QuestBook, id: string, inventory: Inventory = {}): QuestBook {
  const outcome = acceptQuest(defs, book, id, inventory);
  expect(outcome.aceita, `não deu para aceitar ${id}`).toBe(true);
  return outcome.book;
}

describe('aceitar missão', () => {
  it('no começo, só a m01 está disponível', () => {
    expect(availableQuests(defs, {})).toEqual(['m01']);
  });

  it('missão com pré-requisito não aceita antes da hora', () => {
    expect(canAccept(defs, {}, 'm02')).toBe(false);
    const outcome = acceptQuest(defs, {}, 'm02');
    expect(outcome.aceita).toBe(false);
    expect(outcome.book).toEqual({});
  });

  it('aceitar duas vezes não reinicia o progresso', () => {
    const book = play(accept({}, 'm01'), [{ tipo: 'talk', npc: 'npc_bento' }]);
    const again = acceptQuest(defs, book, 'm01');
    expect(again.aceita).toBe(false);
    expect(again.book).toBe(book);
  });

  it('aceitar libera a zona na hora, não na conclusão (SPEC §7.1)', () => {
    const outcome = acceptQuest(defs, {}, 'm01');
    expect(outcome.zonasLiberadas).toEqual(['z2']);
    expect(unlocked(defs, outcome.book).zonas).toEqual(['z2']);
    expect(unlocked(defs, outcome.book).outros).toEqual([]);
  });

  it('missão desconhecida não entra no livro', () => {
    expect(acceptQuest(defs, {}, 'm99').aceita).toBe(false);
  });
});

describe('m01 de ponta a ponta (aceite do M2)', () => {
  it('falar com os três NPCs na ordem conclui a missão', () => {
    let book = accept({}, 'm01');
    expect(questProgress(defs, book, 'm01')).toMatchObject({
      stepIndex: 0,
      texto: 'Fale com o Seu Bento, na Vila Aconchego',
      feito: 0,
      total: 1,
      concluida: false,
    });

    book = play(book, [{ tipo: 'talk', npc: 'npc_bento' }]);
    expect(questProgress(defs, book, 'm01')).toMatchObject({ stepIndex: 1, concluida: false });

    book = play(book, [{ tipo: 'talk', npc: 'npc_iracema' }]);
    expect(questProgress(defs, book, 'm01')).toMatchObject({ stepIndex: 2, concluida: false });

    const final = applyQuestEvent(defs, book, { tipo: 'talk', npc: 'npc_nara' });
    expect(final.concluidas).toEqual(['m01']);
    expect(isDone(final.book, 'm01')).toBe(true);
    expect(final.atualizacoes[0]).toMatchObject({ concluida: true });
  });

  it('conversar fora de ordem não adianta a missão', () => {
    const book = accept({}, 'm01');
    const outcome = applyQuestEvent(defs, book, { tipo: 'talk', npc: 'npc_nara' });
    expect(outcome.atualizacoes).toEqual([]);
    expect(outcome.book).toBe(book);
  });

  it('a recompensa da m01 é 10 moedas e o graveto', () => {
    expect(getQuest('m01').recompensa).toMatchObject({
      moedas: 10,
      itens: ['graveto_reforcado'],
    });
  });
});

describe('m02 de ponta a ponta (aceite do M2)', () => {
  function m01Done(): QuestBook {
    return play(accept({}, 'm01'), [
      { tipo: 'talk', npc: 'npc_bento' },
      { tipo: 'talk', npc: 'npc_iracema' },
      { tipo: 'talk', npc: 'npc_nara' },
    ]);
  }

  it('a m02 só abre depois da m01', () => {
    expect(canAccept(defs, {}, 'm02')).toBe(false);
    expect(availableQuests(defs, m01Done())).toContain('m02');
  });

  it('quebrar 5 caixas e avisar a Nara conclui', () => {
    let book = accept(m01Done(), 'm02');
    for (let i = 1; i <= 4; i += 1) {
      const outcome = applyQuestEvent(defs, book, {
        tipo: 'use',
        objeto: 'caixa_quebravel',
        instancia: `caixa_${i}`,
      });
      book = outcome.book;
      expect(outcome.atualizacoes[0]).toMatchObject({ feito: i, total: 5 });
    }

    // A quinta caixa fecha a parte, e a atualização já traz o objetivo seguinte.
    const quinta = applyQuestEvent(defs, book, {
      tipo: 'use',
      objeto: 'caixa_quebravel',
      instancia: 'caixa_5',
    });
    book = quinta.book;
    expect(quinta.atualizacoes[0]).toMatchObject({
      stepIndex: 1,
      texto: 'Conte para a Nara que o cais está limpo',
      feito: 0,
      total: 1,
      concluida: false,
    });

    const fim = applyQuestEvent(defs, book, { tipo: 'talk', npc: 'npc_nara' });
    expect(fim.concluidas).toEqual(['m02']);
  });

  it('bater na mesma caixa cinco vezes não conta cinco', () => {
    let book = accept(m01Done(), 'm02');
    for (let i = 0; i < 5; i += 1) {
      book = play(book, [{ tipo: 'use', objeto: 'caixa_quebravel', instancia: 'caixa_1' }]);
    }
    expect(questProgress(defs, book, 'm02')).toMatchObject({ feito: 1, total: 5 });
  });

  it('concluir a m02 libera o baú c01', () => {
    let book = accept(m01Done(), 'm02');
    book = play(book, [
      { tipo: 'use', objeto: 'caixa_quebravel', instancia: 'a' },
      { tipo: 'use', objeto: 'caixa_quebravel', instancia: 'b' },
      { tipo: 'use', objeto: 'caixa_quebravel', instancia: 'c' },
      { tipo: 'use', objeto: 'caixa_quebravel', instancia: 'd' },
      { tipo: 'use', objeto: 'caixa_quebravel', instancia: 'e' },
      { tipo: 'talk', npc: 'npc_nara' },
    ]);
    expect(unlocked(defs, book).outros).toContain('c01');
  });
});

describe('tipos de objetivo', () => {
  it('collect soma até o alvo e não passa', () => {
    let book = accept({ m02: { status: 'done', stepIndex: 1, counters: {} } }, 'm03');
    book = play(book, [{ tipo: 'collect', item: 'fruta', qtd: 4 }]);
    expect(questProgress(defs, book, 'm03')).toMatchObject({ feito: 4, total: 6 });
    book = play(book, [{ tipo: 'collect', item: 'fruta', qtd: 10 }]);
    expect(questProgress(defs, book, 'm03')).toMatchObject({ stepIndex: 1 });
  });

  it('item errado não conta', () => {
    const book = accept({ m02: { status: 'done', stepIndex: 1, counters: {} } }, 'm03');
    const outcome = applyQuestEvent(defs, book, { tipo: 'collect', item: 'erva', qtd: 6 });
    expect(outcome.atualizacoes).toEqual([]);
  });

  it('coleta feita antes de aceitar já conta', () => {
    const book = accept({ m02: { status: 'done', stepIndex: 1, counters: {} } }, 'm03', {
      fruta: 6,
    });
    // Seis frutas no bolso fecham a parte de coleta na hora de aceitar.
    expect(questProgress(defs, book, 'm03')).toMatchObject({ stepIndex: 1 });
  });

  it('kill conta só o inimigo pedido', () => {
    let book = accept({ m03: { status: 'done', stepIndex: 1, counters: {} } }, 'm04');
    book = play(book, [
      { tipo: 'kill', inimigo: 'e02' },
      { tipo: 'kill', inimigo: 'e01' },
      { tipo: 'kill', inimigo: 'e01' },
    ]);
    expect(questProgress(defs, book, 'm04')).toMatchObject({ feito: 2, total: 8 });
  });

  it('reach sem ordem aceita qualquer sequência', () => {
    const book = accept(
      {
        m04: { status: 'done', stepIndex: 1, counters: {} },
        m06: { status: 'done', stepIndex: 2, counters: {} },
        m08: { status: 'done', stepIndex: 4, counters: {} },
      },
      'm09',
    );
    const andou = play(book, [
      { tipo: 'reach', ponto: 'marca_falesia' },
      { tipo: 'reach', ponto: 'marca_praia' },
    ]);
    expect(questProgress(defs, andou, 'm09')).toMatchObject({ feito: 2, total: 3 });

    // Passar na mesma marca de novo não conta duas vezes.
    const denovo = play(andou, [{ tipo: 'reach', ponto: 'marca_praia' }]);
    expect(questProgress(defs, denovo, 'm09')).toMatchObject({ feito: 2 });
  });

  it('reach em ordem recusa checkpoint fora de sequência', () => {
    const book = accept({ m11: { status: 'done', stepIndex: 1, counters: {} } }, 'm12');
    const pulou = applyQuestEvent(defs, book, { tipo: 'reach', ponto: 'tentaculo_3' });
    expect(pulou.atualizacoes).toEqual([]);

    const emOrdem = play(book, [
      { tipo: 'reach', ponto: 'tentaculo_1' },
      { tipo: 'reach', ponto: 'tentaculo_2' },
    ]);
    expect(questProgress(defs, emOrdem, 'm12')).toMatchObject({ feito: 2, total: 4 });
  });

  it('defeat_boss fecha a parte do chefe', () => {
    const book = accept({ m12: { status: 'done', stepIndex: 2, counters: {} } }, 'm13');
    const vitoria = applyQuestEvent(defs, book, { tipo: 'defeat_boss', chefe: 'boss1' });
    expect(vitoria.atualizacoes[0]).toMatchObject({ stepIndex: 1 });
    const fim = applyQuestEvent(defs, vitoria.book, { tipo: 'talk', npc: 'npc_anselmo' });
    expect(fim.concluidas).toEqual(['m13']);
  });

  it('mini-chefe não fecha objetivo de chefe', () => {
    const book = accept({ m12: { status: 'done', stepIndex: 2, counters: {} } }, 'm13');
    expect(applyQuestEvent(defs, book, { tipo: 'defeat_boss', chefe: 'mb2' }).atualizacoes).toEqual(
      [],
    );
  });

  it('use sem instância conta cada evento', () => {
    const book = accept({ m10: { status: 'done', stepIndex: 1, counters: {} } }, 'm11');
    const abriu = play(book, [
      { tipo: 'use', objeto: 'comporta' },
      { tipo: 'use', objeto: 'comporta' },
    ]);
    expect(questProgress(defs, abriu, 'm11')).toMatchObject({ feito: 2, total: 3 });
  });

  it('todo objetivo tem alvo de pelo menos 1', () => {
    for (const quest of defs) {
      for (const part of quest.partes) {
        expect(targetOf(part), `${quest.id}/${part.objetivo}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('várias missões ao mesmo tempo', () => {
  it('um evento adianta todas as missões ativas que o esperam', () => {
    const base: QuestBook = {
      m03: { status: 'done', stepIndex: 1, counters: {} },
      m02: { status: 'done', stepIndex: 1, counters: {} },
    };
    let book = accept(base, 'm04');
    book = accept(book, 'm05');
    // m04 quer 8 caranguejos e m05 quer 3 ervas: só a m04 reage a um kill.
    const outcome = applyQuestEvent(defs, book, { tipo: 'kill', inimigo: 'e01' });
    expect(outcome.atualizacoes.map((update) => update.quest)).toEqual(['m04']);
  });

  it('missão travada ou concluída ignora evento', () => {
    const book: QuestBook = { m01: { status: 'done', stepIndex: 2, counters: {} } };
    const outcome = applyQuestEvent(defs, book, { tipo: 'talk', npc: 'npc_nara' });
    expect(outcome.atualizacoes).toEqual([]);
    expect(outcome.book).toBe(book);
  });
});

describe('dicas', () => {
  it('a dica é a da parte atual', () => {
    let book = accept({}, 'm01');
    expect(hintFor(defs, book, 'm01')).toContain('trilha de pedra');
    book = play(book, [{ tipo: 'talk', npc: 'npc_bento' }]);
    expect(hintFor(defs, book, 'm01')).toContain('ervas secando');
  });

  it('missão travada ou concluída não tem dica', () => {
    expect(hintFor(defs, {}, 'm05')).toBeNull();
    expect(
      hintFor(defs, { m01: { status: 'done', stepIndex: 2, counters: {} } }, 'm01'),
    ).toBeNull();
  });
});

describe('estado serializável', () => {
  it('os contadores sobrevivem a uma ida e volta de JSON (coluna jsonb)', () => {
    const book = play(accept({}, 'm01'), [{ tipo: 'talk', npc: 'npc_bento' }]);
    const roundTrip = JSON.parse(JSON.stringify(book)) as QuestBook;
    expect(roundTrip).toEqual(book);
    expect(questProgress(defs, roundTrip, 'm01')).toEqual(questProgress(defs, book, 'm01'));
  });

  it('contadores de partes diferentes não se misturam', () => {
    // A m08 coleta casca, gosma e erva rara em partes seguidas.
    const m08 = getQuest('m08');
    const counters = { p0: 2, p1: 1 };
    expect(progressOf(firstPart(m08, 0), 0, counters)).toBe(2);
    expect(progressOf(firstPart(m08, 1), 1, counters)).toBe(1);
    expect(progressOf(firstPart(m08, 2), 2, counters)).toBe(0);
  });
});

function firstPart(quest: Quest, index: number): Quest['partes'][number] {
  const part = quest.partes[index];
  if (!part) throw new Error(`m08 sem parte ${index}`);
  return part;
}
