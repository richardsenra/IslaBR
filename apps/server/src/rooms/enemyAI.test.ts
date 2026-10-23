import { describe, expect, it } from 'vitest';
import { getEnemy } from '@islabr/content';
import { ATTACK_RADIUS, ATTACK_REACH, alvosAtingidos } from '@islabr/shared';
import {
  criarInimigo,
  levarGolpe,
  passoDaIA,
  type Acao,
  type AlvoDoInimigo,
  type EnemyRuntime,
} from './enemyAI.js';

const DT = 0.05;

function jogadorEm(x: number, z: number, sessionId = 'jogador', atacavel = true): AlvoDoInimigo {
  return { sessionId, x, y: 0, z, atacavel };
}

interface Quadro {
  readonly t: number;
  readonly estado: string;
  readonly y: number;
  readonly x: number;
  readonly z: number;
  readonly acao: Acao | null;
}

/** Roda a IA por `segundos`, com os jogadores que a função devolver em cada instante. */
function rodar(
  inimigo: EnemyRuntime,
  jogadores: (t: number) => readonly AlvoDoInimigo[],
  segundos: number,
): Quadro[] {
  const quadros: Quadro[] = [];
  for (let t = 0; t < segundos; t += DT) {
    const acao = passoDaIA(inimigo, jogadores(t), DT);
    quadros.push({ t, estado: inimigo.estado, y: inimigo.y, x: inimigo.x, z: inimigo.z, acao });
  }
  return quadros;
}

const primeiraAcao = (quadros: readonly Quadro[]): Quadro | undefined =>
  quadros.find((quadro) => quadro.acao !== null);

describe('voador: o mosquito (SPEC §7.6)', () => {
  const ia = getEnemy('e03').ia;
  if (ia?.tipo !== 'voador') throw new Error('e03 precisa ser voador');

  it('orbita no alto, fora do alcance do golpe', () => {
    const mosquito = criarInimigo('m', 'e03', 6, 0);
    const quadros = rodar(mosquito, () => [jogadorEm(0, 0)], 1.2);

    const orbitando = quadros.filter((quadro) => quadro.estado === 'orbitando');
    expect(orbitando.length).toBeGreaterThan(5);
    const maisBaixo = Math.min(...orbitando.map((quadro) => quadro.y));
    expect(maisBaixo).toBeGreaterThan(1.5);

    // De cima, a esfera do golpe (à frente, na altura do peito) não o alcança.
    const alcanca = alvosAtingidos(
      { x: 0, y: 0, z: 0 },
      0,
      [{ id: 'm', x: 0, y: ia.altura, z: ATTACK_REACH }],
      ATTACK_REACH,
      ATTACK_RADIUS,
    );
    expect(alcanca).toHaveLength(0);
  });

  it('avisa antes de mergulhar', () => {
    const mosquito = criarInimigo('m', 'e03', 3, 0);
    const quadros = rodar(mosquito, () => [jogadorEm(0, 0)], 4);

    // Só o primeiro ciclo: o mosquito repete o mergulho depois da recarga.
    const iMergulho = quadros.findIndex((quadro) => quadro.estado === 'mergulhando');
    expect(iMergulho).toBeGreaterThan(0);
    const antes = quadros.slice(0, iMergulho);
    const preparando = antes.filter((quadro) => quadro.estado === 'preparando');
    expect(preparando.length).toBeGreaterThan(0);

    // O aviso dura o que o JSON manda, e termina colado no mergulho.
    expect(preparando.length * DT).toBeGreaterThanOrEqual(ia.aviso - DT * 2);
    expect(preparando.at(-1)?.t ?? 0).toBeLessThan(quadros[iMergulho]?.t ?? 0);
    expect(antes.at(-1)?.estado).toBe('preparando');
  });

  it('morde no mergulho, rente ao chão', () => {
    const mosquito = criarInimigo('m', 'e03', 3, 0);
    const quadros = rodar(mosquito, () => [jogadorEm(0, 0)], 6);

    const mordida = primeiraAcao(quadros);
    expect(mordida?.acao).toMatchObject({ tipo: 'mordida', alvo: 'jogador', dano: 0.5 });
    expect(mordida?.y ?? 99).toBeLessThanOrEqual(1.2);
  });

  it('é vulnerável na descida: aí a esfera do golpe o alcança', () => {
    const mosquito = criarInimigo('m', 'e03', 3, 0);
    const quadros = rodar(mosquito, () => [jogadorEm(0, 0)], 6);
    const mergulhando = quadros.filter((quadro) => quadro.estado === 'mergulhando');
    expect(mergulhando.length).toBeGreaterThan(0);

    const maisBaixo = Math.min(...mergulhando.map((quadro) => quadro.y));
    expect(maisBaixo).toBeLessThan(1);
  });

  it('quem se afasta a tempo escapa do mergulho', () => {
    const mosquito = criarInimigo('m', 'e03', 3, 0);
    // O jogador sai correndo assim que o aviso termina.
    let saiu = false;
    const jogador = (): readonly AlvoDoInimigo[] => {
      if (mosquito.estado === 'mergulhando') saiu = true;
      return [saiu ? jogadorEm(30, 30) : jogadorEm(0, 0)];
    };
    const quadros = rodar(mosquito, jogador, 3);

    expect(quadros.some((quadro) => quadro.estado === 'mergulhando')).toBe(true);
    expect(quadros.every((quadro) => quadro.acao === null)).toBe(true);
  });

  it('depois do mergulho sobe de volta e orbita', () => {
    const mosquito = criarInimigo('m', 'e03', 3, 0);
    const quadros = rodar(mosquito, () => [jogadorEm(0, 0)], 6);
    const mordeu = quadros.findIndex((quadro) => quadro.acao !== null);
    expect(mordeu).toBeGreaterThan(0);

    // Logo depois da mordida: recua e, ao voltar a orbitar, já está no alto.
    const depois = quadros.slice(mordeu + 1);
    expect(depois[0]?.estado).toBe('recuando');
    const volta = depois.find((quadro) => quadro.estado === 'orbitando');
    expect(volta).toBeDefined();
    expect(volta?.y ?? 0).toBeGreaterThan(1.5);
  });

  it('tem recarga entre um mergulho e outro', () => {
    const mosquito = criarInimigo('m', 'e03', 3, 0);
    const quadros = rodar(mosquito, () => [jogadorEm(0, 0)], 12);
    const mordidas = quadros.filter((quadro) => quadro.acao !== null);
    expect(mordidas.length).toBeGreaterThanOrEqual(2);
    const intervalo = (mordidas[1]?.t ?? 0) - (mordidas[0]?.t ?? 0);
    expect(intervalo).toBeGreaterThanOrEqual(ia.recarga);
  });

  it('um golpe derruba, porque tem 1 de vida', () => {
    const mosquito = criarInimigo('m', 'e03', 0, 0);
    expect(levarGolpe(mosquito, 1)).toBe(true);
    expect(mosquito.estado).toBe('morto');
  });
});

describe('saltador: o sapo gosmento (SPEC §7.6)', () => {
  const ia = getEnemy('e04').ia;
  if (ia?.tipo !== 'saltador') throw new Error('e04 precisa ser saltador');

  it('avança em pulos, saindo do chão e voltando', () => {
    const sapo = criarInimigo('s', 'e04', 0, 0);
    const quadros = rodar(sapo, () => [jogadorEm(0, 8)], 3);

    const noAr = quadros.filter((quadro) => quadro.estado === 'pulando');
    expect(noAr.length).toBeGreaterThan(0);
    expect(Math.max(...noAr.map((quadro) => quadro.y))).toBeGreaterThan(0.5);
    // Entre os pulos, está no chão.
    expect(quadros.filter((quadro) => quadro.estado === 'parado').every((q) => q.y === 0)).toBe(
      true,
    );
    expect(sapo.z).toBeGreaterThan(1);
  });

  it('cospe gosma de longe, depois de avisar', () => {
    const sapo = criarInimigo('s', 'e04', 0, 0);
    const quadros = rodar(sapo, () => [jogadorEm(0, 5)], 3);

    const aviso = quadros.filter((quadro) => quadro.estado === 'cuspindo');
    const gosma = quadros.find((quadro) => quadro.acao?.tipo === 'gosma');
    expect(aviso.length).toBeGreaterThan(0);
    expect(gosma?.acao).toMatchObject({
      tipo: 'gosma',
      alvo: 'jogador',
      segundos: ia.lento_segundos,
    });
    expect((aviso.length - 1) * DT).toBeGreaterThanOrEqual(ia.aviso_cuspe - DT * 2);
  });

  it('a gosma não machuca: é só lentidão', () => {
    const sapo = criarInimigo('s', 'e04', 0, 0);
    const quadros = rodar(sapo, () => [jogadorEm(0, 5)], 3);
    const gosma = quadros.find((quadro) => quadro.acao?.tipo === 'gosma')?.acao;
    expect(gosma).toBeDefined();
    expect(gosma).not.toHaveProperty('dano');
  });

  it('quem sai do alcance durante o aviso é poupado', () => {
    const sapo = criarInimigo('s', 'e04', 0, 0);
    const jogador = (): readonly AlvoDoInimigo[] =>
      sapo.estado === 'cuspindo' ? [jogadorEm(0, 40)] : [jogadorEm(0, 5)];
    const quadros = rodar(sapo, jogador, 1.5);
    expect(quadros.some((quadro) => quadro.estado === 'cuspindo')).toBe(true);
    expect(quadros.some((quadro) => quadro.acao?.tipo === 'gosma')).toBe(false);
  });

  it('só cospe de novo depois da recarga do cuspe', () => {
    const sapo = criarInimigo('s', 'e04', 0, 0);
    const quadros = rodar(sapo, () => [jogadorEm(0, 5.5)], 12);
    const gosmas = quadros.filter((quadro) => quadro.acao?.tipo === 'gosma');
    expect(gosmas.length).toBeGreaterThanOrEqual(1);
    if (gosmas.length >= 2) {
      expect((gosmas[1]?.t ?? 0) - (gosmas[0]?.t ?? 0)).toBeGreaterThanOrEqual(ia.recarga_cuspe);
    }
  });

  it('morde ao aterrissar em cima do jogador, com dano 1', () => {
    const sapo = criarInimigo('s', 'e04', 0, 0);
    const quadros = rodar(sapo, () => [jogadorEm(0, 2.6)], 4);
    const mordida = quadros.find((quadro) => quadro.acao?.tipo === 'mordida');
    expect(mordida?.acao).toMatchObject({ tipo: 'mordida', dano: 1 });
  });

  it('levar golpe no meio do pulo não o deixa congelado no ar', () => {
    const sapo = criarInimigo('s', 'e04', 0, 0);
    const quadros: Quadro[] = [];
    let golpeou = false;
    for (let t = 0; t < 3; t += DT) {
      if (sapo.estado === 'pulando' && !golpeou) {
        levarGolpe(sapo, 1);
        golpeou = true;
      }
      const acao = passoDaIA(sapo, [jogadorEm(0, 8)], DT);
      quadros.push({ t, estado: sapo.estado, y: sapo.y, x: sapo.x, z: sapo.z, acao });
    }
    expect(golpeou).toBe(true);
    expect(quadros.at(-1)?.y).toBe(0);
  });

  it('se o jogador some no meio do pulo, ele termina o pulo e desce', () => {
    const sapo = criarInimigo('s', 'e04', 0, 0);
    let sumiu = false;
    const jogador = (): readonly AlvoDoInimigo[] => {
      if (sapo.estado === 'pulando') sumiu = true;
      return sumiu ? [] : [jogadorEm(0, 8)];
    };
    const quadros = rodar(sapo, jogador, 3);
    expect(sumiu).toBe(true);
    expect(quadros.at(-1)?.y).toBeLessThan(0.01);
  });
});

describe('flutuante: a água-viva (SPEC §7.6)', () => {
  const ia = getEnemy('e05').ia;
  if (ia?.tipo !== 'flutuante') throw new Error('e05 precisa ser flutuante');

  it('flutua à altura do JSON, balançando', () => {
    const agua = criarInimigo('a', 'e05', 0, 0);
    const quadros = rodar(agua, () => [jogadorEm(0, 30)], 2);
    const alturas = quadros.map((quadro) => quadro.y);
    expect(Math.min(...alturas)).toBeGreaterThan(ia.altura - 0.3);
    expect(Math.max(...alturas)).toBeLessThan(ia.altura + 0.3);
  });

  it('vai devagar até o jogador', () => {
    const agua = criarInimigo('a', 'e05', 0, 0);
    rodar(agua, () => [jogadorEm(0, 6)], 1);
    // Anda no máximo a velocidade do JSON, e bem menos que um caranguejo.
    expect(agua.z).toBeGreaterThan(0.5);
    expect(agua.z).toBeLessThanOrEqual(ia.velocidade * 1.0 + 0.1);
  });

  it('carrega, parada e avisando, antes do choque', () => {
    const agua = criarInimigo('a', 'e05', 0, 0);
    const quadros = rodar(agua, () => [jogadorEm(0, 1.5)], 3);

    const carga = quadros.filter((quadro) => quadro.estado === 'carregando');
    const choque = quadros.find((quadro) => quadro.acao?.tipo === 'choque');
    expect(carga.length).toBeGreaterThan(0);
    expect(choque).toBeDefined();
    expect(carga.length * DT).toBeGreaterThanOrEqual(ia.carga - DT * 2);
    expect(carga.at(-1)?.t ?? 0).toBeLessThan(choque?.t ?? 0);

    // Enquanto carrega, não sai do lugar.
    const xs = new Set(carga.map((quadro) => quadro.z.toFixed(3)));
    expect(xs.size).toBe(1);
  });

  it('o choque pega todo mundo na área e só quem está nela', () => {
    const agua = criarInimigo('a', 'e05', 0, 0);
    const jogadores = [
      jogadorEm(0, 1.2, 'perto1'),
      jogadorEm(1.0, 0.5, 'perto2'),
      jogadorEm(0, 30, 'longe'),
    ];
    const quadros = rodar(agua, () => jogadores, 3);
    const choque = quadros.find((quadro) => quadro.acao?.tipo === 'choque')?.acao;

    expect(choque).toMatchObject({ tipo: 'choque', dano: 1 });
    if (choque?.tipo !== 'choque') throw new Error('sem choque');
    expect([...choque.alvos].sort()).toEqual(['perto1', 'perto2']);
  });

  it('quem sai da área durante a carga escapa do choque', () => {
    const agua = criarInimigo('a', 'e05', 0, 0);
    const jogador = (): readonly AlvoDoInimigo[] =>
      agua.estado === 'carregando' ? [jogadorEm(0, 40)] : [jogadorEm(0, 1.5)];
    const quadros = rodar(agua, jogador, 3);
    expect(quadros.some((quadro) => quadro.estado === 'carregando')).toBe(true);
    expect(quadros.some((quadro) => quadro.acao?.tipo === 'choque')).toBe(false);
  });

  it('tem recarga entre um choque e outro', () => {
    const agua = criarInimigo('a', 'e05', 0, 0);
    const quadros = rodar(agua, () => [jogadorEm(0, 1.5)], 12);
    const choques = quadros.filter((quadro) => quadro.acao?.tipo === 'choque');
    expect(choques.length).toBeGreaterThanOrEqual(2);
    expect((choques[1]?.t ?? 0) - (choques[0]?.t ?? 0)).toBeGreaterThanOrEqual(ia.recarga);
  });
});

describe('o que vale para todos', () => {
  it('todo inimigo comum sai criado no estado certo do arquétipo', () => {
    expect(criarInimigo('a', 'e01', 0, 0).estado).toBe('parado');
    // O mosquito paira parado até perceber alguém; só então orbita.
    expect(criarInimigo('a', 'e03', 0, 0).estado).toBe('parado');
    expect(criarInimigo('a', 'e04', 0, 0).estado).toBe('parado');
    expect(criarInimigo('a', 'e05', 0, 0).estado).toBe('flutuando');
  });

  it('jogador caído não é alvo de nenhum arquétipo', () => {
    for (const tipo of ['e01', 'e03', 'e04', 'e05']) {
      const bicho = criarInimigo('x', tipo, 0, 0);
      const quadros = rodar(bicho, () => [jogadorEm(0, 1, 'caido', false)], 4);
      expect(
        quadros.every((quadro) => quadro.acao === null),
        tipo,
      ).toBe(true);
    }
  });

  it('sem ninguém por perto, todos ficam quietos e nenhum ataca', () => {
    for (const tipo of ['e01', 'e03', 'e04', 'e05']) {
      const bicho = criarInimigo('x', tipo, 0, 0);
      const quadros = rodar(bicho, () => [jogadorEm(80, 80)], 3);
      expect(
        quadros.every((quadro) => quadro.acao === null),
        tipo,
      ).toBe(true);
    }
  });

  it('desistem da perseguição e voltam ao posto quando o jogador some', () => {
    for (const tipo of ['e01', 'e04', 'e05']) {
      const bicho = criarInimigo('x', tipo, 0, 0);
      rodar(bicho, () => [jogadorEm(0, 4)], 2);
      expect(Math.hypot(bicho.x - bicho.postoX, bicho.z - bicho.postoZ), tipo).toBeGreaterThan(0.3);
      rodar(bicho, () => [], 12);
      expect(Math.hypot(bicho.x - bicho.postoX, bicho.z - bicho.postoZ), tipo).toBeLessThan(0.3);
    }
  });
});
