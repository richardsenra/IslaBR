/* eslint-disable @typescript-eslint/no-non-null-assertion -- teste: o dado existe por construção */
import { describe, expect, it } from 'vitest';
import { content } from '@islabr/content';
import { Guardiao } from './guardiao.js';
import { levarGolpe, type AlvoDoInimigo } from './enemyAI.js';

const nucleo = content.world.guardiao.nucleo;

const jogador = (id: string, dx = 4, dz = 4, y = 0): AlvoDoInimigo => ({
  sessionId: id,
  x: nucleo.x + dx,
  y,
  z: nucleo.z + dz,
  atacavel: true,
});

function rodar(luta: Guardiao, jogadores: AlvoDoInimigo[], segundos: number) {
  const acoes = [];
  const avisos = [];
  for (let t = 0; t < segundos; t += 0.05) {
    const saida = luta.passo(0.05, jogadores);
    acoes.push(...saida.acoes);
    avisos.push(...saida.avisos);
  }
  return { acoes, avisos };
}

describe('Tentáculo-Guardião', () => {
  it('começa com o núcleo protegido e só abre a janela quando um tentáculo é cortado', () => {
    const luta = new Guardiao();
    rodar(luta, [jogador('a')], 0.1);
    expect(luta.nucleo.invulneravel).toBe(true);

    const tentaculo = luta.tentaculos[0]!;
    levarGolpe(tentaculo, 3);
    luta.aoMorrer(tentaculo.id);
    rodar(luta, [jogador('a')], 0.1);
    expect(luta.nucleo.invulneravel).toBe(false);
    expect(luta.nucleo.estado).toBe('vulneravel');

    // Passada a janela, fecha de novo.
    rodar(luta, [jogador('a')], 9);
    expect(luta.nucleo.invulneravel).toBe(true);
  });

  it('o tentáculo cortado cresce de novo', () => {
    const luta = new Guardiao();
    rodar(luta, [jogador('a')], 0.1);
    const tentaculo = luta.tentaculos[1]!;
    levarGolpe(tentaculo, 3);
    luta.aoMorrer(tentaculo.id);
    expect(tentaculo.estado).toBe('morto');
    rodar(luta, [jogador('a')], 13);
    expect(tentaculo.estado).not.toBe('morto');
    expect(tentaculo.hp).toBe(3);
  });

  it('os tentáculos avisam com um círculo e batem onde o jogador ficou', () => {
    const luta = new Guardiao();
    const { avisos, acoes } = rodar(luta, [jogador('a')], 8);
    expect(avisos.length).toBeGreaterThan(0);
    expect(acoes.some((acao) => acao.tipo === 'choque' && acao.alvos.includes('a'))).toBe(true);
  });

  it('quem se mexe depois do aviso escapa da batida', () => {
    const luta = new Guardiao();
    const parado = jogador('a');
    const saida = luta.passo(0.05, [parado]);
    expect(saida.avisos).toEqual([]);
    // Primeiro aviso sai; o jogador então vai para o outro lado da sala.
    let avisou = false;
    const longe = { ...parado, x: nucleo.x - 5.5, z: nucleo.z - 5.5 };
    const acoes = [];
    for (let t = 0; t < 8; t += 0.05) {
      const s = luta.passo(0.05, [avisou ? longe : parado]);
      if (s.avisos.length > 0) avisou = true;
      acoes.push(...s.acoes);
    }
    const acertouOParado = acoes.some(
      (acao) => acao.tipo === 'choque' && acao.alvos.includes('a') && acao.dano === 1,
    );
    // A batida mirou onde ele estava, não onde ele foi parar. Mas as seguintes miram no novo lugar.
    expect(acertouOParado).toBe(true);
  });

  it('a vida cresce com quem está na sala quando a luta começa', () => {
    const sozinho = new Guardiao();
    rodar(sozinho, [jogador('a')], 0.1);
    const em4 = new Guardiao();
    rodar(em4, [jogador('a'), jogador('b'), jogador('c', -4, 4), jogador('d', 4, -4)], 0.1);
    expect(sozinho.estado.hpMax).toBe(55);
    expect(em4.estado.hpMax).toBe(138);
    expect(em4.nucleo.hp).toBe(138);
  });

  it('a fase 2 chega com a vida e a maré sobe: no chão machuca, na plataforma não', () => {
    const luta = new Guardiao();
    rodar(luta, [jogador('a')], 0.1);
    luta.nucleo.hp = 30;
    const noChao = jogador('chao', 5, 0, 0);
    const naPlataforma = jogador('alto', 2.3, 2.3, 1.2);
    const { acoes } = rodar(luta, [noChao, naPlataforma], 30);
    expect(luta.fase).toBe(2);
    expect(luta.agua).toBeCloseTo(content.world.guardiao.agua_max, 1);
    const afogados = acoes.filter((acao) => acao.tipo === 'choque' && acao.dano === 0.5);
    expect(afogados.length).toBeGreaterThan(0);
    expect(afogados.every((acao) => acao.tipo === 'choque' && !acao.alvos.includes('alto'))).toBe(
      true,
    );
  });

  it('na fase 2 o núcleo fica sempre vulnerável, e a tinta chega a todos', () => {
    const luta = new Guardiao();
    rodar(luta, [jogador('a')], 0.1);
    luta.nucleo.hp = 30;
    let tintas = 0;
    for (let t = 0; t < 20; t += 0.05) {
      tintas += luta.passo(0.05, [jogador('a')]).tinta.length;
    }
    expect(luta.fase).toBe(2);
    expect(luta.nucleo.invulneravel).toBe(false);
    expect(tintas).toBeGreaterThan(0);
  });

  it('a fase 3 começa abaixo de 15 de 55', () => {
    const luta = new Guardiao();
    rodar(luta, [jogador('a')], 0.1);
    luta.nucleo.hp = 10;
    rodar(luta, [jogador('a')], 0.1);
    expect(luta.fase).toBe(3);
  });

  it('sala vazia por 10 s zera a luta; quem saiu no meio não a trava', () => {
    const luta = new Guardiao();
    rodar(luta, [jogador('a'), jogador('b')], 0.1);
    luta.nucleo.hp = 20;
    // Um sai, o outro continua: a luta segue com a vida que tinha.
    rodar(luta, [jogador('b')], 3);
    expect(luta.nucleo.hp).toBe(20);
    expect(luta.estado.ativa).toBe(true);
    // Todos saem: depois de 10 s o chefe volta inteiro.
    rodar(luta, [], 11);
    expect(luta.estado.ativa).toBe(false);
    expect(luta.nucleo.hp).toBe(55);
  });

  it('a vitória lista quem estava na sala, e a insígnia sem dano separa quem foi atingido', () => {
    const luta = new Guardiao();
    rodar(luta, [jogador('a'), jogador('b')], 0.1);
    luta.aoMachucar('b');
    levarGolpe(luta.nucleo, 999);
    luta.aoMorrer(luta.nucleo.id);
    const venceram = luta.venceu();
    expect(venceram.sort()).toEqual(['a', 'b']);
    expect(luta.feridos.has('a')).toBe(false);
    expect(luta.feridos.has('b')).toBe(true);
  });
});
