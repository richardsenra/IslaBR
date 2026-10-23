/**
 * Referências cruzadas do conteúdo (SPEC §8: "um teste que carrega tudo e
 * valida referências cruzadas").
 *
 * O schema garante o formato de cada arquivo; aqui é a coerência entre eles:
 * missão que aponta para NPC que existe, baú que entrega item que existe, zona
 * e missão concordando sobre quem libera quem.
 */

import type { Content, Quest } from './index.js';
import { systemUnlock } from './schemas/comum.js';

export interface ContentProblem {
  /** Arquivo e campo onde está o problema. */
  readonly onde: string;
  readonly problema: string;
}

const SYSTEM_UNLOCKS = new Set<string>(systemUnlock.options);

export function checkReferences(content: Content): ContentProblem[] {
  const problems: ContentProblem[] = [];
  const add = (onde: string, problema: string): void => {
    problems.push({ onde, problema });
  };

  const zones = new Set(content.zones.map((zone) => zone.id));
  const npcs = new Map(content.npcs.map((npc) => [npc.id, npc]));
  const quests = new Map(content.quests.map((quest) => [quest.id, quest]));
  const chests = new Map(content.chests.map((chest) => [chest.id, chest]));
  const badges = new Set(content.badges.map((badge) => badge.id));
  const enemies = new Map(content.enemies.map((enemy) => [enemy.id, enemy]));
  const items = new Map(content.items.map((item) => [item.id, item]));
  const recipes = new Set(content.recipes.map((recipe) => recipe.id));
  const dialogues = new Set(Object.keys(content.dialogues));
  const usedDialogues = new Set<string>();

  const needItem = (onde: string, id: string): void => {
    if (!items.has(id)) add(onde, `item inexistente: ${id}`);
  };
  const needDialogue = (onde: string, id: string): void => {
    usedDialogues.add(id);
    if (!dialogues.has(id)) add(onde, `diálogo inexistente: ${id}`);
  };

  // Zonas
  for (const zone of content.zones) {
    const opener = zone.liberada_por;
    if (opener === null) continue;
    const quest = quests.get(opener);
    if (!quest) {
      add(`zones.json/${zone.id}`, `missão inexistente em liberada_por: ${opener}`);
    } else if (!quest.libera_ao_aceitar.includes(zone.id)) {
      add(`zones.json/${zone.id}`, `a missão ${opener} não lista esta zona em libera_ao_aceitar`);
    }
  }

  // NPCs
  for (const npc of content.npcs) {
    for (const zone of npc.zonas) {
      if (!zones.has(zone)) add(`npcs.json/${npc.id}`, `zona inexistente: ${zone}`);
    }
    for (const quest of npc.missoes) {
      if (!quests.has(quest)) add(`npcs.json/${npc.id}`, `missão inexistente: ${quest}`);
    }
    needDialogue(`npcs.json/${npc.id}`, npc.dialogo_ocioso);
  }

  // Missões
  for (const quest of content.quests) {
    const onde = `quests.json/${quest.id}`;
    const giver = npcs.get(quest.npc);
    if (!giver) {
      add(onde, `NPC inexistente: ${quest.npc}`);
    } else if (!giver.missoes.includes(quest.id)) {
      add(onde, `o NPC ${quest.npc} não lista esta missão em missoes`);
    }

    for (const required of quest.requer) {
      if (!quests.has(required)) add(onde, `missão inexistente em requer: ${required}`);
    }

    checkParts(quest, onde);

    needDialogue(onde, quest.dialogo_entrada);
    needDialogue(onde, quest.dialogo_conclusao);

    for (const item of quest.recompensa.itens) needItem(`${onde}/recompensa`, item);
    for (const badge of quest.recompensa.insignias) {
      if (!badges.has(badge)) add(`${onde}/recompensa`, `insígnia inexistente: ${badge}`);
    }

    for (const zone of quest.libera_ao_aceitar) {
      if (!zones.has(zone)) {
        add(onde, `zona inexistente em libera_ao_aceitar: ${zone}`);
      } else if (content.zones.find((z) => z.id === zone)?.liberada_por !== quest.id) {
        add(onde, `a zona ${zone} não aponta para esta missão em liberada_por`);
      }
    }

    for (const unlock of quest.libera) {
      if (SYSTEM_UNLOCKS.has(unlock)) continue;
      if (chests.has(unlock)) {
        const chest = chests.get(unlock);
        if (chest && !chest.requer.includes(quest.id)) {
          add(onde, `o baú ${unlock} não exige esta missão em requer`);
        }
        continue;
      }
      if (quests.has(unlock)) continue;
      add(onde, `id desconhecido em libera: ${unlock}`);
    }
  }

  function checkParts(quest: Quest, onde: string): void {
    quest.partes.forEach((part, index) => {
      const where = `${onde}/partes[${index}]`;
      switch (part.objetivo) {
        case 'talk':
          if (!npcs.has(part.npc)) add(where, `NPC inexistente: ${part.npc}`);
          break;
        case 'collect':
          needItem(where, part.item);
          break;
        case 'kill': {
          const enemy = enemies.get(part.inimigo);
          if (!enemy) add(where, `inimigo inexistente: ${part.inimigo}`);
          else if (enemy.tipo === 'chefe') add(where, 'use defeat_boss para o chefe');
          break;
        }
        case 'reach': {
          const unique = new Set(part.pontos);
          if (unique.size !== part.pontos.length) add(where, 'pontos repetidos');
          break;
        }
        case 'use':
          break;
        case 'defeat_boss': {
          const boss = enemies.get(part.chefe);
          if (!boss) add(where, `chefe inexistente: ${part.chefe}`);
          else if (boss.tipo !== 'chefe') add(where, `${part.chefe} não é chefe`);
          break;
        }
      }
    });
  }

  // Baús
  for (const chest of content.chests) {
    const onde = `chests.json/${chest.id}`;
    if (!zones.has(chest.zona)) add(onde, `zona inexistente: ${chest.zona}`);

    for (const requirement of chest.requer) {
      if (items.has(requirement) || quests.has(requirement) || enemies.has(requirement)) {
        continue;
      }
      add(onde, `exigência desconhecida (nem item, nem missão, nem inimigo): ${requirement}`);
    }

    for (const item of chest.conteudo.itens) needItem(`${onde}/conteudo`, item);
    for (const badge of chest.conteudo.insignias) {
      if (!badges.has(badge)) add(`${onde}/conteudo`, `insígnia inexistente: ${badge}`);
    }
    if (chest.conteudo.coracoes > 0) {
      add(onde, 'coração extra só vem da m06 (SPEC §13); baú não dá coração');
    }
  }

  // Insígnias
  for (const badge of content.badges) {
    const onde = `badges.json/${badge.id}`;
    const condition = badge.condicao;
    if (condition.tipo === 'bau' && !chests.has(condition.bau)) {
      add(onde, `baú inexistente: ${condition.bau}`);
    }
    if (condition.tipo === 'missao' && !quests.has(condition.missao)) {
      add(onde, `missão inexistente: ${condition.missao}`);
    }
    if (condition.tipo === 'chefe_sem_dano') {
      const boss = enemies.get(condition.chefe);
      if (!boss) add(onde, `chefe inexistente: ${condition.chefe}`);
      else if (boss.tipo !== 'chefe') add(onde, `${condition.chefe} não é chefe`);
    }
  }

  // Inimigos
  for (const enemy of content.enemies) {
    const onde = `enemies.json/${enemy.id}`;
    for (const zone of enemy.zonas) {
      if (!zones.has(zone)) add(onde, `zona inexistente: ${zone}`);
    }
    for (const drop of enemy.drops) {
      if (drop.tipo === 'item') needItem(`${onde}/drops`, drop.item);
      else if (drop.min > drop.max) add(`${onde}/drops`, 'moedas com min maior que max');
    }
    if (enemy.tipo === 'chefe') {
      if (!enemy.fases || enemy.fases.length === 0) {
        add(onde, 'chefe sem fases');
      } else {
        const total = enemy.fases.reduce((sum, phase) => sum + phase.hp, 0);
        if (total !== enemy.hp) {
          add(onde, `hp do chefe (${enemy.hp}) não é a soma das fases (${total})`);
        }
      }
    } else if (enemy.fases) {
      add(onde, 'só o chefe tem fases');
    }

    // Sem IA o inimigo comum ficaria parado e inofensivo no mundo.
    if (enemy.tipo === 'comum' && !enemy.ia) add(onde, 'inimigo comum sem ia');
    if (enemy.ia?.tipo === 'perseguidor' && enemy.ia.reflete_de_frente && enemy.tipo !== 'comum') {
      add(onde, 'só inimigo comum reflete golpe');
    }
  }

  // Itens
  for (const item of content.items) {
    const recipe = item.efeito?.ensina_receita;
    if (recipe !== undefined && !recipes.has(recipe)) {
      add(`items.json/${item.id}`, `receita inexistente: ${recipe}`);
    }
    // Item que age ao ser pego precisa saber o que fazer, e não pode ser guardado.
    if (item.usa_ao_pegar) {
      if (!item.efeito?.cura_coracoes)
        add(`items.json/${item.id}`, 'usa_ao_pegar sem cura_coracoes');
      if (item.vendavel) add(`items.json/${item.id}`, 'item usado ao pegar não pode ser vendido');
    }
  }

  // Receitas
  for (const recipe of content.recipes) {
    const onde = `recipes.json/${recipe.id}`;
    needItem(onde, recipe.resultado.item);
    for (const ingredient of recipe.ingredientes) needItem(onde, ingredient.item);
    if (!quests.has(recipe.aprendida_em) && !chests.has(recipe.aprendida_em)) {
      add(onde, `aprendida_em não é missão nem baú: ${recipe.aprendida_em}`);
    }
  }

  // Loja
  const shopQuest = quests.get(content.shop.liberada_por);
  if (!npcs.has(content.shop.npc)) {
    add('shop.json', `NPC inexistente: ${content.shop.npc}`);
  }
  if (!shopQuest) {
    add('shop.json', `missão inexistente em liberada_por: ${content.shop.liberada_por}`);
  } else if (!shopQuest.libera.includes('loja')) {
    add('shop.json', `a missão ${shopQuest.id} não libera a loja`);
  }
  for (const entry of content.shop.itens) {
    needItem('shop.json/itens', entry.item);
    for (const cost of entry.custo.itens) needItem('shop.json/custo', cost.item);
    const free =
      entry.custo.moedas === 0 && entry.custo.joias === 0 && entry.custo.itens.length === 0;
    if (free) add('shop.json/itens', `${entry.item} está de graça`);
  }

  // Diálogos
  for (const [id, dialogue] of Object.entries(content.dialogues)) {
    const onde = `dialogues.pt-BR.json/${id}`;
    if (!npcs.has(dialogue.npc)) add(onde, `NPC inexistente: ${dialogue.npc}`);
    for (const option of dialogue.opcoes ?? []) {
      if (option.vai_para !== undefined) needDialogue(onde, option.vai_para);
    }
  }
  for (const id of dialogues) {
    if (!usedDialogues.has(id)) {
      add(`dialogues.pt-BR.json/${id}`, 'diálogo que ninguém usa');
    }
  }

  return problems;
}
