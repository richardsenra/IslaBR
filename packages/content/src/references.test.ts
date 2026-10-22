import { describe, expect, it } from 'vitest';
import { checkReferences, content, type Content, type Quest } from './index.js';

/** Copia o conteúdo trocando uma missão, para quebrar de propósito. */
function withQuest(id: string, change: (quest: Quest) => Quest): Content {
  return {
    ...content,
    quests: content.quests.map((quest) => (quest.id === id ? change(quest) : quest)),
  };
}

function problemsOf(broken: Content): string[] {
  return checkReferences(broken).map((problem) => `${problem.onde}: ${problem.problema}`);
}

describe('checkReferences pega erro de verdade', () => {
  it('missão apontando para NPC que não existe', () => {
    const broken = withQuest('m02', (quest) => ({ ...quest, npc: 'npc_fantasma' }));
    expect(problemsOf(broken)).toContain('quests.json/m02: NPC inexistente: npc_fantasma');
  });

  it('missão pedindo missão que não existe', () => {
    const broken = withQuest('m02', (quest) => ({ ...quest, requer: ['m99'] }));
    expect(problemsOf(broken)).toContain('quests.json/m02: missão inexistente em requer: m99');
  });

  it('recompensa com item que não existe', () => {
    const broken = withQuest('m02', (quest) => ({
      ...quest,
      recompensa: { ...quest.recompensa, itens: ['espada_lendaria'] },
    }));
    expect(problemsOf(broken)).toContain(
      'quests.json/m02/recompensa: item inexistente: espada_lendaria',
    );
  });

  it('objetivo de conversa com NPC que não existe', () => {
    const broken = withQuest('m02', (quest) => ({
      ...quest,
      partes: [{ objetivo: 'talk', npc: 'npc_ninguem', texto: 'Fale com ninguém' }],
    }));
    expect(problemsOf(broken)).toContain('quests.json/m02/partes[0]: NPC inexistente: npc_ninguem');
  });

  it('zona e missão discordando sobre quem libera', () => {
    const broken = withQuest('m04', (quest) => ({ ...quest, libera_ao_aceitar: [] }));
    expect(problemsOf(broken)).toContain(
      'zones.json/z3: a missão m04 não lista esta zona em libera_ao_aceitar',
    );
  });

  it('missão liberando baú que não exige essa missão', () => {
    const broken = withQuest('m03', (quest) => ({ ...quest, libera: ['loja', 'c02'] }));
    expect(problemsOf(broken)).toContain(
      'quests.json/m03: o baú c02 não exige esta missão em requer',
    );
  });

  it('diálogo que ninguém usa', () => {
    const broken: Content = {
      ...content,
      dialogues: {
        ...content.dialogues,
        sobrou_aqui: { npc: 'npc_nara', caixas: ['Fala esquecida.'] },
      },
    };
    expect(problemsOf(broken)).toContain(
      'dialogues.pt-BR.json/sobrou_aqui: diálogo que ninguém usa',
    );
  });

  it('matar o chefe com objetivo de inimigo comum', () => {
    const broken = withQuest('m13', (quest) => ({
      ...quest,
      partes: [
        { objetivo: 'kill', inimigo: 'boss1', qtd: 1, texto: 'Vença o chefe' },
        ...quest.partes.slice(1),
      ],
    }));
    expect(problemsOf(broken)).toContain('quests.json/m13/partes[0]: use defeat_boss para o chefe');
  });

  it('chefe com hp diferente da soma das fases', () => {
    const broken: Content = {
      ...content,
      enemies: content.enemies.map((enemy) =>
        enemy.id === 'boss1' ? { ...enemy, hp: 40 } : enemy,
      ),
    };
    expect(problemsOf(broken)).toContain(
      'enemies.json/boss1: hp do chefe (40) não é a soma das fases (55)',
    );
  });

  it('item da loja de graça', () => {
    const broken: Content = {
      ...content,
      shop: {
        ...content.shop,
        itens: [{ item: 'pocao_grande', custo: { moedas: 0, joias: 0, itens: [] } }],
      },
    };
    expect(problemsOf(broken)).toContain('shop.json/itens: pocao_grande está de graça');
  });
});
