import { describe, expect, it } from 'vitest';
import {
  CHARGED_MIN_GAP_MS,
  DODGE_COOLDOWN,
  DODGE_INVULN,
  STARTING_PROGRESS,
  addItem,
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
  it('só sai uma vez por recarga', () => {
    const sessao = jogador();
    expect(sessao.podeAtacar(1_000_000, 'attack1')).toBe(true);
    sessao.registrarGolpe('attack1', 1_000_000);

    expect(sessao.podeAtacar(1_000_000 + 100, 'attack2')).toBe(false);
    expect(sessao.podeAtacar(1_000_000 + recargaDoGolpeMs('attack1') + 1, 'attack2')).toBe(true);
  });

  it('o carregado exige o tempo de ter sido segurado', () => {
    const sessao = jogador();
    sessao.registrarGolpe('attack1', 1_000_000);

    // Passada a recarga do golpe normal, mas sem ter dado tempo de carregar.
    const logoDepois = 1_000_000 + recargaDoGolpeMs('attack1') + 10;
    expect(logoDepois - 1_000_000).toBeLessThan(CHARGED_MIN_GAP_MS);
    expect(sessao.podeAtacar(logoDepois, 'attack2')).toBe(true);
    expect(sessao.podeAtacar(logoDepois, 'charged')).toBe(false);

    // Esperando o suficiente, o carregado passa.
    expect(sessao.podeAtacar(1_000_000 + CHARGED_MIN_GAP_MS + 1, 'charged')).toBe(true);
  });

  it('carregado em rajada não bate mais que o golpe normal em rajada', () => {
    function danoEm(golpe: 'attack1' | 'charged', dano: number): number {
      const sessao = jogador();
      let total = 0;
      for (let ms = 1_000_000; ms < 1_000_000 + 10_000; ms += 10) {
        if (!sessao.podeAtacar(ms, golpe)) continue;
        sessao.registrarGolpe(golpe, ms);
        total += dano;
      }
      return total;
    }
    // Normal tira 1; carregado tira 2 (CHARGED_MULTIPLIER).
    expect(danoEm('charged', 2)).toBeLessThanOrEqual(danoEm('attack1', 1) * 1.2);
  });

  it('a melhor arma do inventário é a que vale', () => {
    expect(jogador().arma).toBeNull();

    const comGraveto = jogador(addItem(STARTING_PROGRESS, 'graveto_reforcado'));
    expect(comGraveto.arma).toBe('graveto_reforcado');

    const comAmbas = jogador(addItem(addItem(STARTING_PROGRESS, 'graveto_reforcado'), 'arma_nv2'));
    expect(comAmbas.arma).toBe('arma_nv2');
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
