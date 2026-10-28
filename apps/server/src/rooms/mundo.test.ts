import { describe, expect, it } from 'vitest';
import { content } from '@islabr/content';
import {
  ARENA_SPOTS,
  ARENA_TRIGGERS,
  STARTING_PROGRESS,
  addItem,
  type PlayerProgress,
  type QuestBook,
} from '@islabr/shared';
import { PlayerSession } from './playerSession.js';

const NASCER = { seq: 0, x: 0, y: 0, z: 0, atMs: 0 };

function jogador(
  progress: PlayerProgress = STARTING_PROGRESS,
  book: QuestBook = {},
): PlayerSession {
  return new PlayerSession(NASCER, { id: 'teste', progress, book });
}

const feita = { status: 'done', stepIndex: 0, counters: {} } as const;

describe('moedas soltas e gatilhos', () => {
  it('a moeda solta paga uma vez por sessão', () => {
    const sessao = jogador();
    const primeira = sessao.passarPor(-12, 0, 12);
    expect(primeira.moedas.map((moeda) => moeda.id)).toEqual(['moeda_z1_1']);
    expect(sessao.progress.moedas).toBe(1);
    expect(sessao.passarPor(-12, 0, 12).moedas).toEqual([]);
    expect(sessao.progress.moedas).toBe(1);
  });

  it('chegar na gruta dá a insígnia b01, uma vez, e ela vai para o livro do jogador', () => {
    const sessao = jogador();
    expect(sessao.passarPor(36, 0, 40).insignias).toEqual(['b01']);
    sessao.passarPor(0, 0, 0);
    expect(sessao.passarPor(36, 0, 40).insignias).toEqual([]);
    expect(sessao.progress.insignias).toEqual(['b01']);
  });

  it('o topo do farol só vale lá em cima, não embaixo', () => {
    const sessao = jogador();
    expect(sessao.passarPor(10, 0, -9).insignias).toEqual([]);
    expect(sessao.passarPor(10, 9.4, -9).insignias).toEqual(['b02']);
  });

  it('as marcas de ventosa contam para a m09, em qualquer ordem', () => {
    const sessao = jogador(STARTING_PROGRESS, {
      m09: { status: 'active', stepIndex: 0, counters: {} },
    });
    sessao.passarPor(-44, 0, -1);
    const depois = sessao.passarPor(44, 0, 44);
    expect(depois.atualizacoes.at(-1)?.feito).toBe(2);
  });
});

describe('loja do Seu Bento', () => {
  it('fica fechada até a m03 terminar', () => {
    const sessao = jogador({ ...STARTING_PROGRESS, moedas: 100 });
    expect(sessao.comprar('pocao_pequena')).toEqual({ ok: false, aviso: 'loja-fechada' });
  });

  it('cobra o preço do conteúdo e entrega o item', () => {
    const sessao = jogador({ ...STARTING_PROGRESS, moedas: 20 }, { m03: feita });
    expect(sessao.comprar('pocao_pequena').ok).toBe(true);
    expect(sessao.progress.moedas).toBe(5);
    expect(sessao.progress.itens['pocao_pequena']).toBe(1);
  });

  it('recusa sem dinheiro e sem os ingredientes da armadura', () => {
    const pobre = jogador({ ...STARTING_PROGRESS, moedas: 5 }, { m03: feita });
    expect(pobre.comprar('pocao_pequena')).toEqual({ ok: false, aviso: 'sem-dinheiro' });
    const semCasca = jogador({ ...STARTING_PROGRESS, moedas: 100 }, { m03: feita });
    expect(semCasca.comprar('armadura_nv1')).toEqual({ ok: false, aviso: 'faltam-itens' });
    const comCasca = jogador(addItem({ ...STARTING_PROGRESS, moedas: 100 }, 'casca_espinhosa', 3), {
      m03: feita,
    });
    expect(comCasca.comprar('armadura_nv1').ok).toBe(true);
    expect(comCasca.progress.itens['casca_espinhosa']).toBe(0);
    expect(comCasca.progress.moedas).toBe(40);
  });

  it('não vende o que a loja não tem', () => {
    const sessao = jogador({ ...STARTING_PROGRESS, moedas: 999 }, { m03: feita });
    expect(sessao.comprar('machado')).toEqual({ ok: false, aviso: 'nao-tem' });
  });
});

describe('bancada do Zé Calango', () => {
  it('só fabrica receita aprendida', () => {
    const sessao = jogador(addItem(addItem(STARTING_PROGRESS, 'ferrao'), 'erva'));
    expect(sessao.fabricar('pocao_pequena')).toEqual({ ok: false, aviso: 'nao-aprendida' });
  });

  it('gasta os ingredientes e entrega a poção', () => {
    const sessao = jogador(addItem(addItem(STARTING_PROGRESS, 'ferrao'), 'erva'), { m08: feita });
    expect(sessao.fabricar('pocao_pequena').ok).toBe(true);
    expect(sessao.progress.itens['pocao_pequena']).toBe(1);
    expect(sessao.progress.itens['ferrao']).toBe(0);
  });

  it('recusa sem ingredientes', () => {
    const sessao = jogador(STARTING_PROGRESS, { m08: feita });
    expect(sessao.fabricar('pocao_pequena')).toEqual({ ok: false, aviso: 'faltam-itens' });
  });

  it('fabricar o repelente na m08 cumpre o passo da bancada', () => {
    let progress = STARTING_PROGRESS;
    progress = addItem(progress, 'casca_caranguejo', 2);
    progress = addItem(progress, 'gosma');
    progress = addItem(progress, 'erva_rara');
    const sessao = jogador(progress, {
      m08: { status: 'active', stepIndex: 3, counters: {} },
    });
    const resultado = sessao.fabricar('repelente');
    expect(resultado.ok).toBe(true);
    expect(sessao.progress.itens['repelente']).toBe(1);
    expect(sessao.book['m08']?.stepIndex).toBe(4);
  });
});

describe('a ilha de ponta a ponta (aceite do M4)', () => {
  it('um jogador novo cumpre da m01 à m09 só com o que existe no mundo', () => {
    const sessao = jogador();
    const spotDoNpc = (npc: string) => {
      const spot = ARENA_SPOTS.find(
        (candidato) => candidato.tipo === 'npc' && candidato.alvo === npc,
      );
      if (!spot) throw new Error(`NPC sem lugar no mundo: ${npc}`);
      return spot;
    };
    const quests = content.quests.filter((quest) => quest.id <= 'm09');

    for (let volta = 0; volta < 500; volta += 1) {
      const ativa = quests.find((quest) => sessao.book[quest.id]?.status === 'active');
      if (!ativa) {
        const proxima = quests.find((quest) => sessao.book[quest.id]?.status !== 'done');
        if (!proxima) break;
        sessao.interagir(spotDoNpc(proxima.npc));
        expect(sessao.book[proxima.id]?.status, `aceitar ${proxima.id}`).toBe('active');
        continue;
      }

      const passo = ativa.partes[sessao.book[ativa.id]?.stepIndex ?? 0];
      if (!passo) throw new Error(`${ativa.id} sem passo`);
      const antes = JSON.stringify(sessao.book[ativa.id]);

      switch (passo.objetivo) {
        case 'talk':
          sessao.interagir(spotDoNpc(passo.npc));
          break;
        case 'collect': {
          const fontes = ARENA_SPOTS.filter(
            (spot) => spot.tipo === 'coletavel' && spot.alvo === passo.item,
          );
          if (fontes.length > 0) {
            for (const fonte of fontes) sessao.interagir(fonte);
          } else if (passo.item === 'erva_rara') {
            sessao.interagir(ARENA_SPOTS.find((spot) => spot.alvo === 'c04')!);
          } else {
            // Drop de bicho: o sorteio é testado em outro lugar.
            sessao.progress = addItem(sessao.progress, passo.item, passo.qtd);
            sessao['evento']({ tipo: 'collect', item: passo.item, qtd: passo.qtd });
          }
          break;
        }
        case 'kill':
          for (let i = 0; i < passo.qtd; i += 1) {
            sessao['evento']({ tipo: 'kill', inimigo: passo.inimigo });
          }
          break;
        case 'use':
          if (passo.objeto === 'bancada_calango') {
            expect(sessao.fabricar('repelente').ok).toBe(true);
          } else {
            for (const spot of ARENA_SPOTS.filter((candidato) => candidato.alvo === passo.objeto)) {
              sessao.interagir(spot);
            }
          }
          break;
        case 'reach':
          for (const ponto of passo.pontos) {
            const gatilho = ARENA_TRIGGERS.find((candidato) => candidato.id === ponto);
            if (!gatilho) throw new Error(`ponto sem gatilho: ${ponto}`);
            sessao.passarPor(gatilho.x, gatilho.y, gatilho.z);
          }
          break;
        case 'defeat_boss':
          throw new Error('o chefe fica para o M5');
      }

      const depois = JSON.stringify(sessao.book[ativa.id]);
      // Cada volta tem de andar: se não andou, a missão trava no mundo.
      expect(
        depois === antes && sessao.book[ativa.id]?.status === 'active',
        `${ativa.id} travou em ${JSON.stringify(passo)}`,
      ).toBe(false);
    }

    for (const quest of quests) {
      expect(sessao.book[quest.id]?.status, quest.id).toBe('done');
    }
    expect(sessao.progress.insignias).toContain('b07');
    expect(sessao.progress.coracoesMax).toBe(4);
    // Aceitar as missões abriu a Vila, a Praia, o Pântano e as Falésias; a caverna espera a m10.
    sessao.atualizarZonas(false);
    expect([...sessao.zonas].sort()).toEqual(['z1', 'z2', 'z3', 'z4', 'z5']);
  });
});
