import { describe, expect, it } from 'vitest';
import { getEnemy } from '@islabr/content';
import { sorteioComSemente } from '@islabr/shared';
import { danoRecebido, resolverAtaque, type Atacante } from './combate.js';
import { criarInimigo, levarGolpe, passoDaIA, type EnemyRuntime } from './enemyAI.js';

const COM_GRAVETO: Atacante = { x: 0, y: 0, z: 0, yaw: 0, arma: 'graveto_reforcado' };

function caranguejoEm(x: number, z: number, id = 'e01_1'): EnemyRuntime {
  return criarInimigo(id, 'e01', x, z);
}

describe('golpe do jogador', () => {
  it('acerta quem está na frente', () => {
    const alvo = caranguejoEm(0, 1.5);
    const resultado = resolverAtaque(COM_GRAVETO, 'attack1', [alvo], sorteioComSemente(1));
    expect(resultado.acertos).toHaveLength(1);
    expect(resultado.acertos[0]?.dano).toBe(1);
    expect(alvo.hp).toBe(1);
  });

  it('não acerta quem está atrás nem quem está longe', () => {
    const atras = caranguejoEm(0, -1.5, 'atras');
    const longe = caranguejoEm(0, 9, 'longe');
    const resultado = resolverAtaque(COM_GRAVETO, 'attack1', [atras, longe], sorteioComSemente(1));
    expect(resultado.acertos).toHaveLength(0);
    expect(atras.hp).toBe(getEnemy('e01').hp);
  });

  it('dois golpes derrubam o caranguejo e sai o saque', () => {
    const alvo = caranguejoEm(0, 1.5);
    const sorteio = sorteioComSemente(20261022);
    resolverAtaque(COM_GRAVETO, 'attack1', [alvo], sorteio);
    const segundo = resolverAtaque(COM_GRAVETO, 'attack2', [alvo], sorteio);

    expect(segundo.acertos[0]?.morreu).toBe(true);
    expect(alvo.estado).toBe('morto');
    expect(segundo.acertos[0]?.saque).not.toBeNull();
  });

  it('inimigo morto não é acertado de novo', () => {
    const alvo = caranguejoEm(0, 1.5);
    levarGolpe(alvo, 99);
    const resultado = resolverAtaque(COM_GRAVETO, 'attack1', [alvo], sorteioComSemente(1));
    expect(resultado.acertos).toHaveLength(0);
  });

  it('sem arma na mão, o golpe não machuca', () => {
    const alvo = caranguejoEm(0, 1.5);
    const resultado = resolverAtaque(
      { ...COM_GRAVETO, arma: null },
      'attack1',
      [alvo],
      sorteioComSemente(1),
    );
    expect(resultado.acertos[0]?.dano).toBe(0);
    expect(alvo.hp).toBe(getEnemy('e01').hp);
  });

  it('um golpe pode pegar dois inimigos encostados', () => {
    const a = caranguejoEm(-0.4, 1.4, 'a');
    const b = caranguejoEm(0.4, 1.6, 'b');
    const resultado = resolverAtaque(COM_GRAVETO, 'attack1', [a, b], sorteioComSemente(3));
    expect(resultado.acertos).toHaveLength(2);
  });

  it('o espinhoso de frente devolve o golpe (SPEC §7.6)', () => {
    const espinhoso = criarInimigo('e02_1', 'e02', 0, 1.5);
    // Olhando para o jogador, que está em -Z em relação a ele.
    espinhoso.yaw = Math.PI;
    const resultado = resolverAtaque(COM_GRAVETO, 'attack1', [espinhoso], sorteioComSemente(1));
    expect(resultado.acertos[0]?.dano).toBe(0);
    expect(resultado.refletido).toBe(0.5);
    expect(espinhoso.hp).toBe(getEnemy('e02').hp);
  });

  it('o espinhoso de costas leva dano normal', () => {
    const espinhoso = criarInimigo('e02_1', 'e02', 0, 1.5);
    espinhoso.yaw = 0; // de costas para o jogador
    const resultado = resolverAtaque(COM_GRAVETO, 'attack1', [espinhoso], sorteioComSemente(1));
    expect(resultado.acertos[0]?.dano).toBe(1);
    expect(resultado.refletido).toBe(0);
  });
});

describe('dano no jogador', () => {
  it('a armadura apara meio coração', () => {
    expect(danoRecebido({ dano: 1, invulneravel: false, temArmadura: true })).toBe(0.5);
    expect(danoRecebido({ dano: 1, invulneravel: false, temArmadura: false })).toBe(1);
  });

  it('invulnerável não leva nada', () => {
    expect(danoRecebido({ dano: 1, invulneravel: true, temArmadura: false })).toBe(0);
  });
});

describe('IA do inimigo', () => {
  const jogador = (x: number, z: number, atacavel = true) => [
    { sessionId: 'jogador', x, y: 0, z, atacavel },
  ];

  it('fica parado sem ninguém por perto', () => {
    const bicho = caranguejoEm(0, 0);
    const mordida = passoDaIA(bicho, jogador(50, 50), 0.05);
    expect(mordida).toBeNull();
    expect(bicho.estado).toBe('parado');
  });

  it('persegue quem chega perto', () => {
    const bicho = caranguejoEm(0, 0);
    const antes = bicho.z;
    const mordida = passoDaIA(bicho, jogador(0, 5), 0.2);
    expect(mordida).toBeNull();
    expect(bicho.estado).toBe('perseguindo');
    expect(bicho.z).toBeGreaterThan(antes);
  });

  it('morde quando alcança, e respeita a recarga', () => {
    const bicho = caranguejoEm(0, 0);
    const primeira = passoDaIA(bicho, jogador(0, 1), 0.05);
    expect(primeira).toMatchObject({ alvo: 'jogador', dano: getEnemy('e01').dano });

    const segunda = passoDaIA(bicho, jogador(0, 1), 0.05);
    expect(segunda).toBeNull();

    // A próxima mordida só vem depois da recarga inteira.
    let esperou = 0.05;
    let proxima = null;
    for (let i = 0; i < 200 && !proxima; i += 1) {
      esperou += 0.05;
      proxima = passoDaIA(bicho, jogador(0, 1), 0.05);
    }
    expect(proxima).not.toBeNull();
    // A recarga vem do JSON do inimigo, não de uma constante do código.
    const ia = getEnemy('e01').ia;
    expect(ia?.recarga).toBeGreaterThan(0);
    expect(esperou).toBeGreaterThanOrEqual((ia?.recarga ?? 99) - 0.05);
  });

  it('não persegue jogador caído', () => {
    const bicho = caranguejoEm(0, 0);
    const mordida = passoDaIA(bicho, jogador(0, 1, false), 0.05);
    expect(mordida).toBeNull();
    expect(bicho.estado).toBe('parado');
  });

  it('apanhou, para um instante antes de reagir', () => {
    const bicho = caranguejoEm(0, 0);
    levarGolpe(bicho, 1);
    expect(bicho.hp).toBe(1);
    const mordida = passoDaIA(bicho, jogador(0, 1), 0.05);
    expect(mordida).toBeNull();
    expect(bicho.estado).toBe('ferido');
  });

  it('morto não faz mais nada', () => {
    const bicho = caranguejoEm(0, 0);
    expect(levarGolpe(bicho, 99)).toBe(true);
    expect(passoDaIA(bicho, jogador(0, 1), 0.05)).toBeNull();
    expect(bicho.estado).toBe('morto');
  });

  it('volta para o posto quando o jogador some', () => {
    const bicho = caranguejoEm(0, 0);
    passoDaIA(bicho, jogador(0, 5), 1);
    expect(bicho.z).toBeGreaterThan(0);

    for (let i = 0; i < 60; i += 1) passoDaIA(bicho, jogador(90, 90), 0.1);
    expect(Math.hypot(bicho.x - bicho.postoX, bicho.z - bicho.postoZ)).toBeLessThan(0.2);
  });
});
