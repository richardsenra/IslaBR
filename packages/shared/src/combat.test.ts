import { describe, expect, it } from 'vitest';
import { getEnemy, getItem } from '@islabr/content';
import {
  CHARGED_MULTIPLIER,
  COMBO_WINDOW_SECONDS,
  alvosAtingidos,
  aplicarDano,
  centroDoGolpe,
  danoDaArma,
  danoDoGolpe,
  danoNoJogador,
  dentroDaEsfera,
  golpeDeFrente,
  proximoGolpe,
  resolverGolpe,
} from './combat.js';

describe('dano das armas', () => {
  it('o graveto tira 1 e a arma nível 2 tira 2 (SPEC §6)', () => {
    expect(danoDaArma('graveto_reforcado')).toBe(1);
    expect(danoDaArma('arma_nv2')).toBe(2);
    expect(getItem('graveto_reforcado').efeito?.dano).toBe(danoDaArma('graveto_reforcado'));
    expect(getItem('arma_nv2').efeito?.dano).toBe(danoDaArma('arma_nv2'));
  });

  it('sem arma na mão, não machuca', () => {
    expect(danoDaArma(null)).toBe(0);
    expect(danoDaArma('pocao_pequena')).toBe(0);
  });

  it('o golpe carregado dobra o dano', () => {
    expect(danoDoGolpe('graveto_reforcado', 'charged')).toBe(CHARGED_MULTIPLIER);
    expect(danoDoGolpe('arma_nv2', 'charged')).toBe(2 * CHARGED_MULTIPLIER);
  });

  it('os três golpes do combo tiram o mesmo', () => {
    const golpes = ['attack1', 'attack2', 'attack3'] as const;
    for (const golpe of golpes) {
      expect(danoDoGolpe('graveto_reforcado', golpe)).toBe(1);
    }
  });
});

describe('combo de 3 golpes (SPEC §6)', () => {
  it('emenda os três na sequência', () => {
    expect(proximoGolpe(null, 0)).toBe('attack1');
    expect(proximoGolpe('attack1', 0.2)).toBe('attack2');
    expect(proximoGolpe('attack2', 0.2)).toBe('attack3');
  });

  it('depois do terceiro, recomeça', () => {
    expect(proximoGolpe('attack3', 0.2)).toBe('attack1');
  });

  it('esperar demais quebra o combo', () => {
    expect(proximoGolpe('attack2', COMBO_WINDOW_SECONDS + 0.01)).toBe('attack1');
  });

  it('o carregado não entra na contagem do combo', () => {
    expect(proximoGolpe('charged', 0.2)).toBe('attack1');
  });
});

describe('esfera de acerto', () => {
  const origem = { x: 0, y: 0, z: 0 };

  it('o golpe sai à frente, na direção do yaw', () => {
    const paraZ = centroDoGolpe(origem, 0, 2);
    expect(paraZ.z).toBeCloseTo(2, 6);
    expect(paraZ.x).toBeCloseTo(0, 6);

    const paraX = centroDoGolpe(origem, Math.PI / 2, 2);
    expect(paraX.x).toBeCloseTo(2, 6);
    expect(paraX.z).toBeCloseTo(0, 6);
  });

  it('pega quem está na frente e não quem está atrás', () => {
    const alvos = [
      { id: 'frente', x: 0, y: 0, z: 1.6 },
      { id: 'atras', x: 0, y: 0, z: -1.6 },
      { id: 'longe', x: 0, y: 0, z: 9 },
    ];
    const pegos = alvosAtingidos(origem, 0, alvos).map((a) => a.id);
    expect(pegos).toEqual(['frente']);
  });

  it('pega mais de um e devolve do mais perto para o mais longe', () => {
    const alvos = [
      { id: 'longe', x: 0.5, y: 0, z: 2.2 },
      { id: 'perto', x: 0, y: 0, z: 1.5 },
    ];
    expect(alvosAtingidos(origem, 0, alvos).map((a) => a.id)).toEqual(['perto', 'longe']);
  });

  it('inimigo voando alto escapa do golpe', () => {
    const centro = centroDoGolpe(origem, 0);
    expect(dentroDaEsfera(centro, { x: 0, y: 0, z: 1.6 }, 0.9)).toBe(true);
    expect(dentroDaEsfera(centro, { x: 0, y: 4, z: 1.6 }, 0.9)).toBe(false);
  });
});

describe('caranguejo espinhoso (SPEC §7.6)', () => {
  const espinhoso = getEnemy('e02');

  it('golpe de frente volta no jogador e não machuca o bicho', () => {
    const resultado = resolverGolpe({
      arma: 'graveto_reforcado',
      golpe: 'attack1',
      refleteDeFrente: true,
      deFrente: true,
      danoDoInimigo: espinhoso.dano,
    });
    expect(resultado.dano).toBe(0);
    expect(resultado.refletido).toBe(0.5);
  });

  it('pelas costas, leva dano normal', () => {
    const resultado = resolverGolpe({
      arma: 'graveto_reforcado',
      golpe: 'attack1',
      refleteDeFrente: true,
      deFrente: false,
      danoDoInimigo: espinhoso.dano,
    });
    expect(resultado.dano).toBe(1);
    expect(resultado.refletido).toBe(0);
  });

  it('quem não reflete leva dano de qualquer lado', () => {
    for (const deFrente of [true, false]) {
      const resultado = resolverGolpe({
        arma: 'graveto_reforcado',
        golpe: 'attack1',
        refleteDeFrente: false,
        deFrente,
        danoDoInimigo: 0.5,
      });
      expect(resultado.dano).toBe(1);
    }
  });

  it('golpeDeFrente enxerga de que lado veio o golpe', () => {
    const alvo = { x: 0, y: 0, z: 0 };
    // Inimigo olhando para +Z; jogador na frente dele.
    expect(golpeDeFrente({ x: 0, y: 0, z: 2 }, alvo, 0)).toBe(true);
    // Jogador atrás.
    expect(golpeDeFrente({ x: 0, y: 0, z: -2 }, alvo, 0)).toBe(false);
    // Bem de lado fica na divisa: conta como frente com a tolerância padrão.
    expect(golpeDeFrente({ x: 2, y: 0, z: 0 }, alvo, 0)).toBe(true);
  });
});

describe('dano no jogador', () => {
  it('a esquiva zera o dano enquanto dura (SPEC §6)', () => {
    expect(danoNoJogador({ dano: 1, invulneravel: true, reducao: 0 })).toBe(0);
    expect(danoNoJogador({ dano: 1, invulneravel: false, reducao: 0 })).toBe(1);
  });

  it('a armadura apara meio coração (SPEC §7.7)', () => {
    expect(danoNoJogador({ dano: 1, invulneravel: false, reducao: 0.5 })).toBe(0.5);
    expect(danoNoJogador({ dano: 0.5, invulneravel: false, reducao: 0.5 })).toBe(0);
  });

  it('dano nunca vira cura', () => {
    expect(danoNoJogador({ dano: 0.5, invulneravel: false, reducao: 2 })).toBe(0);
  });

  it('o resultado anda de meio em meio coração (SPEC §5)', () => {
    const valor = danoNoJogador({ dano: 0.7, invulneravel: false, reducao: 0 });
    expect(Number.isInteger(valor * 2)).toBe(true);
  });
});

describe('vida', () => {
  it('o caranguejo comum cai em 2 golpes de graveto (SPEC §7.6)', () => {
    const caranguejo = getEnemy('e01');
    let hp = caranguejo.hp;
    hp = aplicarDano(hp, danoDoGolpe('graveto_reforcado', 'attack1'));
    expect(hp).toBe(1);
    hp = aplicarDano(hp, danoDoGolpe('graveto_reforcado', 'attack2'));
    expect(hp).toBe(0);
  });

  it('com a arma nível 2, cai em um', () => {
    expect(aplicarDano(getEnemy('e01').hp, danoDoGolpe('arma_nv2', 'attack1'))).toBe(0);
  });

  it('o mosquito cai em um golpe', () => {
    expect(aplicarDano(getEnemy('e03').hp, 1)).toBe(0);
  });

  it('vida não fica negativa', () => {
    expect(aplicarDano(1, 99)).toBe(0);
  });

  it('o chefe aguenta a soma das fases', () => {
    const chefe = getEnemy('boss1');
    expect(aplicarDano(chefe.hp, 54)).toBe(1);
  });
});
