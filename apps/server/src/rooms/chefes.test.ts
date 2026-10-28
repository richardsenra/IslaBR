import { describe, expect, it } from 'vitest';
import { criarInimigo, levarGolpe, passoDaIA, type Acao, type AlvoDoInimigo } from './enemyAI.js';

const jogador = (x: number, z: number): AlvoDoInimigo => ({
  sessionId: 'a',
  x,
  y: 0,
  z,
  atacavel: true,
});

/** Roda a IA por `segundos` e junta o que ela fez. */
function rodar(
  chefe: ReturnType<typeof criarInimigo>,
  jogadores: AlvoDoInimigo[],
  segundos: number,
): Acao[] {
  const acoes: Acao[] = [];
  for (let t = 0; t < segundos; t += 0.05) {
    const acao = passoDaIA(chefe, jogadores, 0.05);
    if (acao) acoes.push(acao);
  }
  return acoes;
}

describe('Caranguejo-Rei (mb1)', () => {
  it('avisa a investida com um círculo no chão antes de atacar', () => {
    const rei = criarInimigo('mb1_1', 'mb1', 0, 0);
    rei.recarga = 0;
    passoDaIA(rei, [jogador(0, 6)], 0.05);
    expect(rei.estado).toBe('preparando');
    expect(rei.avisos).toHaveLength(1);
    expect(rei.avisos[0]).toMatchObject({ x: 0, z: 6 });
  });

  it('quem fica parado onde o círculo apareceu leva o dano', () => {
    const rei = criarInimigo('mb1_1', 'mb1', 0, 0);
    rei.recarga = 0;
    const acoes = rodar(rei, [jogador(0, 6)], 3);
    expect(acoes.some((acao) => acao.tipo === 'choque' && acao.alvos.includes('a'))).toBe(true);
  });

  it('quem sai do círculo a tempo escapa da investida', () => {
    const rei = criarInimigo('mb1_1', 'mb1', 0, 0);
    rei.recarga = 0;
    passoDaIA(rei, [jogador(0, 6)], 0.05);
    // O jogador corre para longe do ponto avisado e o rei o persegue de novo.
    const acoes = rodar(rei, [jogador(8, 6)], 1.2);
    expect(acoes.filter((acao) => acao.tipo === 'choque')).toEqual([]);
  });

  it('só chove bolha abaixo da metade da vida', () => {
    const inteiro = criarInimigo('mb1_1', 'mb1', 0, 0);
    inteiro.recarga = 99;
    passoDaIA(inteiro, [jogador(0, 6)], 0.05);
    expect(inteiro.estado).not.toBe('bolhas');

    const ferido = criarInimigo('mb1_1', 'mb1', 0, 0);
    ferido.recarga = 99;
    ferido.hp = 5;
    passoDaIA(ferido, [jogador(0, 6)], 0.05);
    expect(ferido.estado).toBe('bolhas');
    expect(ferido.avisos.length).toBeGreaterThanOrEqual(5);
  });
});

describe('Sapo-Ancestral (mb2)', () => {
  it('chama mosquitos, e o pedido sai com o teto do JSON', () => {
    const sapo = criarInimigo('mb2_1', 'mb2', 0, 0);
    passoDaIA(sapo, [jogador(0, 7)], 0.05);
    expect(sapo.invocar).toBe(2);
    expect(sapo.maxInvocados).toBe(4);
  });

  it('pula em área sobre o jogador e acerta quem ficou', () => {
    const sapo = criarInimigo('mb2_1', 'mb2', 0, 0);
    sapo.recarga = 0;
    const acoes = rodar(sapo, [jogador(0, 7)], 3);
    expect(acoes.some((acao) => acao.tipo === 'choque')).toBe(true);
    expect(sapo.y).toBe(0);
  });

  it('não fica tonto a cada golpe: a luta não vira trava', () => {
    const sapo = criarInimigo('mb2_1', 'mb2', 0, 0);
    levarGolpe(sapo, 1);
    expect(sapo.atordoado).toBe(0);
    const caranguejo = criarInimigo('e01_1', 'e01', 0, 0);
    levarGolpe(caranguejo, 1);
    expect(caranguejo.atordoado).toBeGreaterThan(0);
  });
});
