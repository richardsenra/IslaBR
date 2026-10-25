import { describe, expect, it } from 'vitest';
import {
  CHARGE_SECONDS,
  DODGE_COOLDOWN,
  DODGE_INVULN,
  STARTING_PROGRESS,
  addItem,
  duracaoDoGolpe,
  impactoDoGolpe,
  intervaloMinimoMs,
  recargaDoGolpeMs,
  type PlayerProgress,
} from '@islabr/shared';
import { PlayerSession } from './playerSession.js';

const NASCER = { seq: 0, x: 0, y: 0, z: 0, atMs: 0 };

/** Um jogador novo, sem nada na mão. */
function jogador(progress: PlayerProgress = STARTING_PROGRESS): PlayerSession {
  return new PlayerSession(NASCER, { id: 'teste', progress, book: {} });
}

describe('dano no jogador', () => {
  it('tira o dano dos corações e marca para salvar', () => {
    const sessao = jogador();
    expect(sessao.levarDano(1, 0)).toBe(1);
    expect(sessao.progress.coracoes).toBe(2);
    expect(sessao.sujo).toBe(true);
  });

  it('dano seguido não acumula: há carência depois de apanhar', () => {
    const sessao = jogador();
    expect(sessao.levarDano(0.5, 0)).toBe(0.5);
    expect(sessao.levarDano(0.5, 10)).toBe(0);
    expect(sessao.progress.coracoes).toBe(2.5);

    // Passada a carência, volta a levar.
    sessao.passar(1);
    expect(sessao.levarDano(0.5, 20)).toBe(0.5);
    expect(sessao.progress.coracoes).toBe(2);
  });

  it('a armadura apara meio coração', () => {
    const sessao = jogador(addItem(STARTING_PROGRESS, 'armadura_nv1'));
    expect(sessao.temArmadura).toBe(true);
    expect(sessao.levarDano(1, 0)).toBe(0.5);
    expect(sessao.progress.coracoes).toBe(2.5);
  });

  it('a armadura anula o mordida de meio coração', () => {
    const sessao = jogador(addItem(STARTING_PROGRESS, 'armadura_nv1'));
    expect(sessao.levarDano(0.5, 0)).toBe(0);
    expect(sessao.progress.coracoes).toBe(3);
  });

  it('corações nunca ficam negativos', () => {
    const sessao = jogador();
    sessao.levarDano(99, 0);
    expect(sessao.progress.coracoes).toBe(0);
  });
});

describe('cair e voltar', () => {
  it('sem corações o jogador cai', () => {
    const sessao = jogador();
    expect(sessao.vivo).toBe(true);
    sessao.levarDano(3, 0);
    expect(sessao.vivo).toBe(false);
  });

  it('avisa quando levanta, para o cliente saber que a vida voltou', () => {
    const sessao = jogador();
    sessao.levarDano(3, 0);

    // Enquanto está caído, nada mudou que o cliente precise saber.
    expect(sessao.passar(1)).toBe(false);
    expect(sessao.passar(1)).toBe(false);
    // No instante em que levanta, sim.
    expect(sessao.passar(1.5)).toBe(true);
    expect(sessao.vivo).toBe(true);
    // E depois disso, de novo nada.
    expect(sessao.passar(0.05)).toBe(false);
  });

  it('levanta invulnerável, para não cair de novo no meio de quem o derrubou', () => {
    const sessao = jogador();
    sessao.levarDano(3, 0);
    sessao.passar(4);

    expect(sessao.vivo).toBe(true);
    expect(sessao.invulneravel).toBe(true);
    expect(sessao.levarDano(1, 0)).toBe(0);

    // Passada a invulnerabilidade, volta a levar dano.
    sessao.passar(2.1);
    expect(sessao.levarDano(1, 0)).toBe(1);
  });

  it('levanta com os corações cheios depois de alguns segundos', () => {
    const sessao = jogador();
    sessao.levarDano(3, 0);

    sessao.passar(1);
    expect(sessao.vivo).toBe(false);

    sessao.passar(2.5);
    expect(sessao.vivo).toBe(true);
    expect(sessao.progress.coracoes).toBe(sessao.progress.coracoesMax);
  });

  it('volta com o máximo novo, depois do quarto coração da m06', () => {
    const quatro: PlayerProgress = { ...STARTING_PROGRESS, coracoes: 4, coracoesMax: 4 };
    const sessao = jogador(quatro);
    sessao.levarDano(4, 0);
    sessao.passar(5);
    expect(sessao.progress.coracoes).toBe(4);
  });
});

describe('esquiva', () => {
  it('dá invulnerabilidade curta (SPEC §6)', () => {
    const sessao = jogador();
    expect(sessao.tentarEsquivar(0)).toBe(true);
    expect(sessao.invulneravel).toBe(true);
    expect(sessao.levarDano(1, 0)).toBe(0);

    sessao.passar(DODGE_INVULN + 0.01);
    expect(sessao.invulneravel).toBe(false);
    expect(sessao.levarDano(1, 1000)).toBe(1);
  });

  it('a recarga de 1,2 s é imposta pelo servidor', () => {
    const sessao = jogador();
    expect(sessao.tentarEsquivar(0)).toBe(true);
    // Um cliente adulterado repetindo `dodge` não ganha invulnerabilidade nova.
    expect(sessao.tentarEsquivar(300)).toBe(false);
    expect(sessao.tentarEsquivar(DODGE_COOLDOWN * 1000 - 1)).toBe(false);
    expect(sessao.tentarEsquivar(DODGE_COOLDOWN * 1000)).toBe(true);
  });

  it('esquivas em rajada não deixam o jogador invulnerável o tempo todo', () => {
    const sessao = jogador();
    let invulneravelPorMs = 0;
    for (let ms = 0; ms < 5000; ms += 50) {
      sessao.tentarEsquivar(ms);
      sessao.passar(0.05);
      if (sessao.invulneravel) invulneravelPorMs += 50;
    }
    // 5 s de rajada rendem no máximo 5 esquivas de 0,25 s.
    expect(invulneravelPorMs).toBeLessThan(1500);
  });
});

describe('golpe do jogador', () => {
  const T0 = 1_000_000;

  it('só sai de novo depois do intervalo mínimo entre impactos', () => {
    const sessao = jogador();
    expect(sessao.podeAtacar(T0, 'attack1')).toBe(true);
    sessao.registrarGolpe('attack1', T0);

    const minimo = intervaloMinimoMs('attack1', 'attack2');
    expect(sessao.podeAtacar(T0 + 50, 'attack2')).toBe(false);
    expect(sessao.podeAtacar(T0 + minimo - 200, 'attack2')).toBe(false);
    expect(sessao.podeAtacar(T0 + minimo, 'attack2')).toBe(true);
  });

  it('a folga de rede deixa passar um pacote um pouco adiantado, e só um pouco', () => {
    const sessao = jogador();
    sessao.registrarGolpe('attack1', T0);
    const minimo = intervaloMinimoMs('attack1', 'attack2');
    expect(sessao.podeAtacar(T0 + minimo - 50, 'attack2')).toBe(true);
    expect(sessao.podeAtacar(T0 + minimo - 120, 'attack2')).toBe(false);
  });

  it('o mínimo é o de quem joga direito: recarga menos o impacto de um mais o do outro', () => {
    // Golpe seguinte com impacto mais cedo precisa de mais espera entre chegadas.
    const a = intervaloMinimoMs('attack1', 'attack2');
    expect(a).toBe(
      recargaDoGolpeMs('attack1') -
        impactoDoGolpe('attack1') * 1000 +
        impactoDoGolpe('attack2') * 1000,
    );
    expect(intervaloMinimoMs(null, 'attack1')).toBe(0);
    for (const de of ['attack1', 'attack2', 'attack3', 'charged'] as const) {
      for (const para of ['attack1', 'attack2', 'attack3', 'charged'] as const) {
        expect(intervaloMinimoMs(de, para), `${de} -> ${para}`).toBeGreaterThan(0);
      }
    }
  });

  it('o impacto vem antes do fim do golpe, e a recarga antes do fim também', () => {
    for (const golpe of ['attack1', 'attack2', 'attack3', 'charged'] as const) {
      expect(impactoDoGolpe(golpe), golpe).toBeGreaterThan(0);
      expect(impactoDoGolpe(golpe), golpe).toBeLessThan(duracaoDoGolpe(golpe));
      expect(recargaDoGolpeMs(golpe) / 1000, golpe).toBeLessThan(duracaoDoGolpe(golpe));
      // O impacto cai antes da recarga acabar: nunca há dois golpes em voo.
      expect(impactoDoGolpe(golpe) * 1000, golpe).toBeLessThan(recargaDoGolpeMs(golpe));
    }
  });

  it('o carregado exige o tempo de ter sido segurado, contado a partir do golpe anterior', () => {
    const sessao = jogador();
    sessao.registrarGolpe('attack1', T0);

    const segurar =
      CHARGE_SECONDS * 1000 + impactoDoGolpe('charged') * 1000 - impactoDoGolpe('attack1') * 1000;
    expect(intervaloMinimoMs('attack1', 'charged')).toBeGreaterThanOrEqual(segurar);

    // Mais cedo que isso o jogador não teria tido tempo de carregar.
    expect(sessao.podeAtacar(T0 + segurar - 200, 'charged')).toBe(false);
    expect(sessao.podeAtacar(T0 + segurar, 'charged')).toBe(true);
  });

  it('golpe em rajada não bate mais rápido que quem joga no ritmo certo', () => {
    function golpesEm(golpe: 'attack1' | 'charged', ms: number): number {
      const sessao = jogador();
      let total = 0;
      for (let t = T0; t < T0 + ms; t += 5) {
        if (!sessao.podeAtacar(t, golpe)) continue;
        sessao.registrarGolpe(golpe, t);
        total += 1;
      }
      return total;
    }
    // 10 s apertando o mais rápido que dá: nunca passa do ritmo do projeto, mais a folga.
    const ritmo = 10_000 / (intervaloMinimoMs('attack1', 'attack1') - 60) + 1;
    expect(golpesEm('attack1', 10_000)).toBeLessThanOrEqual(ritmo);
  });

  it('carregado em rajada não rende mais dano por segundo que o golpe normal', () => {
    function danoEm(golpe: 'attack1' | 'charged', dano: number): number {
      const sessao = jogador();
      let total = 0;
      for (let ms = T0; ms < T0 + 10_000; ms += 10) {
        if (!sessao.podeAtacar(ms, golpe)) continue;
        sessao.registrarGolpe(golpe, ms);
        total += dano;
      }
      return total;
    }
    expect(danoEm('charged', 2)).toBeLessThanOrEqual(danoEm('attack1', 1) * 1.6);
  });

  it('a melhor arma do inventário é a que vale', () => {
    expect(jogador().arma).toBeNull();

    const comGraveto = jogador(addItem(STARTING_PROGRESS, 'graveto_reforcado'));
    expect(comGraveto.arma).toBe('graveto_reforcado');

    const comAmbas = jogador(addItem(addItem(STARTING_PROGRESS, 'graveto_reforcado'), 'arma_nv2'));
    expect(comAmbas.arma).toBe('arma_nv2');
  });
});

describe('kit de teste', () => {
  it('dá os itens que o jogador ainda não tem', () => {
    const sessao = jogador();
    sessao.darKitDeTeste(['graveto_reforcado', 'arma_nv2']);
    expect(sessao.progress.itens['graveto_reforcado']).toBe(1);
    expect(sessao.progress.itens['arma_nv2']).toBe(1);
    expect(sessao.arma).toBe('arma_nv2');
    expect(sessao.sujo).toBe(true);
  });

  it('não repete o item de quem já tem: entrar de novo não acumula', () => {
    const sessao = jogador();
    sessao.darKitDeTeste(['arma_nv2']);
    sessao.darKitDeTeste(['arma_nv2']);
    expect(sessao.progress.itens['arma_nv2']).toBe(1);
  });

  it('kit vazio não mexe em nada', () => {
    const sessao = jogador();
    sessao.darKitDeTeste([]);
    expect(sessao.progress).toEqual(STARTING_PROGRESS);
    expect(sessao.sujo).toBe(false);
    expect(sessao.arma).toBeNull();
  });
});

describe('saque e missão', () => {
  it('moedas e itens que caem entram na carteira', () => {
    const sessao = jogador();
    sessao.receber({ moedas: 3, itens: ['casca_caranguejo', 'casca_caranguejo'] });
    expect(sessao.progress.moedas).toBe(3);
    expect(sessao.progress.itens['casca_caranguejo']).toBe(2);
    expect(sessao.sujo).toBe(true);
  });

  it('matar um inimigo sem missão ativa não faz nada nas missões', () => {
    const sessao = jogador();
    expect(sessao.contarMorte('e01')).toEqual([]);
  });
});

/** Um jogador ferido, com poções no bolso. */
function ferido(coracoes: number, itens: Readonly<Record<string, number>>): PlayerSession {
  return jogador({ ...STARTING_PROGRESS, coracoes, itens });
}

describe('usar item (SPEC §4: use_item)', () => {
  it('a poção pequena devolve 2 corações e é gasta', () => {
    const sessao = ferido(0.5, { pocao_pequena: 2 });
    expect(sessao.usarItem('pocao_pequena')).toEqual({ usado: true });
    expect(sessao.progress.coracoes).toBe(2.5);
    expect(sessao.progress.itens['pocao_pequena']).toBe(1);
    expect(sessao.sujo).toBe(true);
  });

  it('a cura nunca passa do máximo', () => {
    const sessao = ferido(2, { pocao_pequena: 1 });
    sessao.usarItem('pocao_pequena');
    expect(sessao.progress.coracoes).toBe(3);
  });

  it('a poção grande devolve todos os corações', () => {
    const sessao = ferido(0.5, { pocao_grande: 1 });
    expect(sessao.usarItem('pocao_grande')).toEqual({ usado: true });
    expect(sessao.progress.coracoes).toBe(3);
  });

  it('com a vida cheia a poção de cura é recusada, não desperdiçada', () => {
    const sessao = ferido(3, { pocao_pequena: 1, pocao_grande: 1 });
    expect(sessao.usarItem('pocao_pequena')).toEqual({ usado: false, recusa: 'vida-cheia' });
    expect(sessao.usarItem('pocao_grande')).toEqual({ usado: false, recusa: 'vida-cheia' });
    expect(sessao.progress.itens['pocao_pequena']).toBe(1);
    expect(sessao.progress.itens['pocao_grande']).toBe(1);
  });

  it('item que o jogador não tem não funciona', () => {
    const sessao = ferido(1, {});
    expect(sessao.usarItem('pocao_pequena')).toEqual({ usado: false, recusa: 'nao-tem' });
  });

  it('item que não é consumível não funciona, nem arma, nem chave', () => {
    const sessao = ferido(1, { graveto_reforcado: 1, chave_iracema: 1, erva: 1 });
    for (const item of ['graveto_reforcado', 'chave_iracema', 'erva']) {
      expect(sessao.usarItem(item)).toEqual({ usado: false, recusa: 'nao-usavel' });
    }
    expect(sessao.progress.itens['graveto_reforcado']).toBe(1);
  });

  it('id inventado é recusado sem derrubar nada', () => {
    const sessao = ferido(1, {});
    expect(sessao.usarItem('item_que_nao_existe')).toEqual({ usado: false, recusa: 'nao-tem' });
    expect(sessao.usarItem('')).toEqual({ usado: false, recusa: 'nao-tem' });
  });

  it('quem está caído não usa poção', () => {
    const sessao = ferido(3, { pocao_grande: 1 });
    sessao.levarDano(3, 0);
    expect(sessao.usarItem('pocao_grande')).toEqual({ usado: false, recusa: 'caido' });
  });

  it('gastar a última poção deixa zero, sem ficar negativo', () => {
    const sessao = ferido(1, { pocao_pequena: 1 });
    sessao.usarItem('pocao_pequena');
    expect(sessao.progress.itens['pocao_pequena']).toBe(0);
    expect(sessao.usarItem('pocao_pequena')).toEqual({ usado: false, recusa: 'nao-tem' });
  });
});

describe('Poção Heróica: corações emprestados (SPEC §7.7, proposta)', () => {
  it('dá 2 corações além do máximo, mesmo com a vida cheia', () => {
    const sessao = ferido(3, { pocao_heroica: 1 });
    expect(sessao.usarItem('pocao_heroica')).toEqual({ usado: true });
    expect(sessao.progress.coracoes).toBe(5);
    expect(sessao.progress.coracoesMax).toBe(3);
  });

  it('acabado o tempo, o que passa do máximo some', () => {
    const sessao = ferido(3, { pocao_heroica: 1 });
    sessao.usarItem('pocao_heroica');

    sessao.passar(59);
    expect(sessao.progress.coracoes).toBe(5);
    sessao.passar(2);
    expect(sessao.progress.coracoes).toBe(3);
  });

  it('avisa o cliente quando os corações emprestados acabam', () => {
    const sessao = ferido(3, { pocao_heroica: 1 });
    sessao.usarItem('pocao_heroica');
    expect(sessao.passar(30)).toBe(false);
    expect(sessao.passar(31)).toBe(true);
    expect(sessao.passar(1)).toBe(false);
  });

  it('o fim do efeito não tira vida de quem já tinha perdido os emprestados', () => {
    const sessao = ferido(3, { pocao_heroica: 1 });
    sessao.usarItem('pocao_heroica');
    sessao.levarDano(3, 0); // gasta os 2 emprestados e mais 1 dos seus
    sessao.passar(1); // passa a carência
    expect(sessao.progress.coracoes).toBe(2);

    sessao.passar(61);
    expect(sessao.progress.coracoes).toBe(2);
  });

  it('a cura comum não tira os corações emprestados', () => {
    const sessao = ferido(3, { pocao_heroica: 1, pocao_pequena: 1 });
    sessao.usarItem('pocao_heroica');
    // Com a vida acima do máximo, a poção de cura é recusada (vida cheia).
    expect(sessao.usarItem('pocao_pequena')).toEqual({ usado: false, recusa: 'vida-cheia' });
    expect(sessao.progress.coracoes).toBe(5);
  });

  it('o que vai para o banco nunca tem coração emprestado', () => {
    const sessao = ferido(3, { pocao_heroica: 1 });
    sessao.usarItem('pocao_heroica');
    expect(sessao.progress.coracoes).toBe(5);
    expect(sessao.paraSalvar().coracoes).toBe(3);
  });
});

describe('coração pequeno: cura na hora, não vai para o inventário', () => {
  it('cura meio coração ao ser pego', () => {
    const sessao = ferido(2, {});
    sessao.receber({ moedas: 0, itens: ['coracao_pequeno'] });
    expect(sessao.progress.coracoes).toBe(2.5);
    expect(sessao.progress.itens['coracao_pequeno']).toBeUndefined();
  });

  it('com a vida cheia, não cura nada e também não ocupa o inventário', () => {
    const sessao = ferido(3, {});
    sessao.receber({ moedas: 0, itens: ['coracao_pequeno'] });
    expect(sessao.progress.coracoes).toBe(3);
    expect(sessao.progress.itens['coracao_pequeno']).toBeUndefined();
  });

  it('vários corações pequenos de uma vez curam todos, até o máximo', () => {
    const sessao = ferido(2, {});
    sessao.receber({ moedas: 0, itens: ['coracao_pequeno', 'coracao_pequeno', 'coracao_pequeno'] });
    expect(sessao.progress.coracoes).toBe(3);
  });

  it('outros itens do mesmo saque continuam indo para o inventário', () => {
    const sessao = ferido(2, {});
    sessao.receber({ moedas: 2, itens: ['coracao_pequeno', 'casca_caranguejo'] });
    expect(sessao.progress.itens['casca_caranguejo']).toBe(1);
    expect(sessao.progress.moedas).toBe(2);
  });
});
