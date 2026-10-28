import { describe, expect, it } from 'vitest';
import {
  checkReferences,
  content,
  getDialogue,
  getItem,
  getQuest,
  loadContent,
  questsFile,
} from './index.js';

describe('carregamento', () => {
  it('todos os arquivos passam pelos schemas', () => {
    expect(() => loadContent()).not.toThrow();
  });

  it('não sobra nem falta referência entre os arquivos', () => {
    expect(checkReferences(content)).toEqual([]);
  });

  it('campo escrito errado quebra o carregamento', () => {
    const quest = {
      ...getQuest('m02'),
      titulos: 'Caixas no Cais',
    };
    expect(() => questsFile.parse([quest])).toThrow();
  });
});

describe('números da ilha (SPEC §1 e §7)', () => {
  it('6 zonas, 6 NPCs, 14 missões, 10 baús, 8 insígnias', () => {
    expect(content.zones).toHaveLength(6);
    expect(content.npcs).toHaveLength(6);
    expect(content.quests).toHaveLength(14);
    expect(content.chests).toHaveLength(10);
    expect(content.badges).toHaveLength(8);
  });

  it('5 inimigos comuns, 2 mini-chefes e 1 chefe', () => {
    const porTipo = (tipo: string): number =>
      content.enemies.filter((enemy) => enemy.tipo === tipo).length;
    expect(porTipo('comum')).toBe(5);
    expect(porTipo('mini_chefe')).toBe(2);
    expect(porTipo('chefe')).toBe(1);
    // Os tentáculos do chefe: parte da luta, fora da contagem da spec.
    expect(porTipo('parte_de_chefe')).toBe(1);
  });

  it('as missões vão de m01 a m14, em ordem', () => {
    const ids = content.quests.map((quest) => quest.id);
    expect(ids).toEqual([
      'm01',
      'm02',
      'm03',
      'm04',
      'm05',
      'm06',
      'm07',
      'm08',
      'm09',
      'm10',
      'm11',
      'm12',
      'm13',
      'm14',
    ]);
  });

  it('as 330 moedas garantidas e as 9 joias fecham (SPEC §7.7)', () => {
    const deMissoes = content.quests.reduce((sum, q) => sum + q.recompensa.moedas, 0);
    const deBaus = content.chests.reduce((sum, c) => sum + c.conteudo.moedas, 0);
    const deMiniChefes = content.enemies
      .filter((enemy) => enemy.tipo === 'mini_chefe')
      .flatMap((enemy) => enemy.drops)
      .reduce((sum, drop) => (drop.tipo === 'moedas' ? sum + drop.min : sum), 0);
    // Faltam as 30 moedas soltas pela ilha, que são posicionamento de mundo (M4).
    const moedasSoltas = 30;
    expect(deMissoes + deBaus + deMiniChefes + moedasSoltas).toBe(330);

    const joias =
      content.quests.reduce((sum, q) => sum + q.recompensa.joias, 0) +
      content.chests.reduce((sum, c) => sum + c.conteudo.joias, 0);
    expect(joias).toBe(9);
  });

  it('só a m06 dá coração extra, e dá um só (SPEC §13)', () => {
    const comCoracao = content.quests.filter((quest) => quest.recompensa.coracoes > 0);
    expect(comCoracao.map((quest) => quest.id)).toEqual(['m06']);
    expect(comCoracao[0]?.recompensa.coracoes).toBe(1);
  });
});

describe('fluxo das missões', () => {
  it('toda missão só exige missões anteriores a ela', () => {
    const ordem = content.quests.map((quest) => quest.id);
    for (const quest of content.quests) {
      for (const required of quest.requer) {
        expect(ordem.indexOf(required)).toBeLessThan(ordem.indexOf(quest.id));
      }
    }
  });

  it('a última parte de cada missão é uma conversa', () => {
    for (const quest of content.quests) {
      const last = quest.partes[quest.partes.length - 1];
      expect(last?.objetivo, quest.id).toBe('talk');
    }
  });

  it('a fala de conclusão é de quem aparece na última parte', () => {
    for (const quest of content.quests) {
      const last = quest.partes[quest.partes.length - 1];
      if (last?.objetivo !== 'talk') continue;
      expect(getDialogue(quest.dialogo_conclusao).npc, quest.id).toBe(last.npc);
    }
  });

  it('a fala de entrada é de quem dá a missão', () => {
    for (const quest of content.quests) {
      expect(getDialogue(quest.dialogo_entrada).npc, quest.id).toBe(quest.npc);
    }
  });

  it('a m09 exige a m06, porque uma marca fica nas falésias (SPEC §13)', () => {
    expect(getQuest('m09').requer).toContain('m06');
  });

  it('as zonas z2 a z6 abrem ao aceitar a missão, não ao concluir', () => {
    const abertas = content.quests.flatMap((quest) => quest.libera_ao_aceitar);
    expect(abertas.sort()).toEqual(['z2', 'z3', 'z4', 'z5', 'z6']);
    for (const quest of content.quests) {
      for (const unlock of quest.libera) {
        expect(unlock, `${quest.id} libera zona ao concluir`).not.toMatch(/^z\d$/);
      }
    }
  });

  it('cada missão tem dica em toda parte que não é só conversar', () => {
    for (const quest of content.quests) {
      for (const part of quest.partes) {
        expect(part.dica, `${quest.id}/${part.objetivo}`).toBeDefined();
      }
    }
  });
});

describe('itens de missão e chaves', () => {
  it('chave e item de missão não gastam, não vendem e não descartam (SPEC §7.4)', () => {
    for (const item of content.items) {
      if (item.tipo !== 'chave' && item.tipo !== 'missao') continue;
      expect(item.consumivel, item.id).toBe(false);
      expect(item.vendavel, item.id).toBe(false);
      expect(item.descartavel, item.id).toBe(false);
    }
  });

  it('a mesma chave da m06 abre a casa e o baú c06 (SPEC §13)', () => {
    const casa = getQuest('m06').partes.find((part) => part.objetivo === 'use');
    expect(casa?.objetivo).toBe('use');
    const c06 = content.chests.find((chest) => chest.id === 'c06');
    expect(c06?.requer).toEqual(['chave_iracema']);
  });

  it('os 3 pedaços de mapa estão nos baús c03, c05 e c09 (SPEC §13)', () => {
    const comPedaco = content.chests
      .filter((chest) => chest.conteudo.itens.includes('pedaco_mapa'))
      .map((chest) => chest.id);
    expect(comPedaco).toEqual(['c03', 'c05', 'c09']);
    expect(getQuest('m10').partes[0]).toMatchObject({ item: 'pedaco_mapa', qtd: 3 });
  });

  it('a arma nível 2 só vem do baú c05 (SPEC §7.7)', () => {
    const fontes = content.chests
      .filter((chest) => chest.conteudo.itens.includes('arma_nv2'))
      .map((chest) => chest.id);
    expect(fontes).toEqual(['c05']);
    expect(content.shop.itens.map((entry) => entry.item)).not.toContain('arma_nv2');
    expect(getItem('arma_nv2').efeito?.dano).toBe(2);
  });

  it('a erva rara só existe no baú c04 e só serve ao repelente (SPEC §13)', () => {
    const fontes = content.chests.filter((chest) => chest.conteudo.itens.includes('erva_rara'));
    expect(fontes.map((chest) => chest.id)).toEqual(['c04']);
    const usos = content.recipes.filter((recipe) =>
      recipe.ingredientes.some((ingredient) => ingredient.item === 'erva_rara'),
    );
    expect(usos.map((recipe) => recipe.id)).toEqual(['repelente']);
  });
});

describe('loja e receitas', () => {
  it('a loja cobra os preços da SPEC §7.7', () => {
    const preco = (item: string): unknown =>
      content.shop.itens.find((entry) => entry.item === item)?.custo;
    expect(preco('pocao_pequena')).toMatchObject({ moedas: 15, joias: 0 });
    expect(preco('pocao_grande')).toMatchObject({ moedas: 40 });
    expect(preco('pocao_heroica')).toMatchObject({ joias: 1, moedas: 0 });
    expect(preco('armadura_nv1')).toMatchObject({
      moedas: 60,
      itens: [{ item: 'casca_espinhosa', qtd: 3 }],
    });
  });

  it('a poção grande usa erva comum e gel, não a erva rara (SPEC §13)', () => {
    const grande = content.recipes.find((recipe) => recipe.id === 'pocao_grande');
    expect(grande?.ingredientes).toEqual([
      { item: 'gel_brilhante', qtd: 2 },
      { item: 'erva', qtd: 2 },
    ]);
  });

  it('a m08 ensina a receita da poção pequena, não entrega o repelente (SPEC §13)', () => {
    const m08 = getQuest('m08');
    expect(m08.recompensa.itens).toEqual(['receita_pocao_pequena']);
    expect(m08.recompensa.itens).not.toContain('repelente');
  });
});

describe('falas', () => {
  it('nenhuma fala passa de 3 caixas (SPEC §7.2)', () => {
    for (const [id, dialogue] of Object.entries(content.dialogues)) {
      expect(dialogue.caixas.length, id).toBeLessThanOrEqual(3);
      expect(dialogue.caixas.length, id).toBeGreaterThan(0);
    }
  });

  it('todo NPC tem fala de ocioso', () => {
    for (const npc of content.npcs) {
      expect(getDialogue(npc.dialogo_ocioso).npc).toBe(npc.id);
    }
  });

  it('nenhum texto cita a referência que não pode ser usada', () => {
    const proibido = /milmo/i;
    const tudo = JSON.stringify(content);
    expect(proibido.test(tudo)).toBe(false);
  });
});
