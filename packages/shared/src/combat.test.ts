import { describe, expect, it } from 'vitest';
import { boxFromCenter } from './collision.js';
import { getEnemy, getItem } from '@islabr/content';
import {
  ATTACK_RADIUS,
  ATTACK_REACH,
  CHARGED_KNOCKBACK,
  CHARGED_MULTIPLIER,
  CHARGED_RADIUS,
  CHARGED_REACH,
  COMBO_WINDOW_SECONDS,
  alvosAtingidos,
  areaDoGolpe,
  armaEmUso,
  empurraoDoGolpe,
  aplicarDano,
  centroDoGolpe,
  danoDaArma,
  danoDoGolpe,
  danoNoJogador,
  dentroDaEsfera,
  empurrar,
  melhorArma,
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

describe('melhor arma', () => {
  it('sem arma no inventário, nenhuma', () => {
    expect(melhorArma({})).toBeNull();
    expect(melhorArma({ pocao_pequena: 3, erva: 2 })).toBeNull();
  });

  it('com só o graveto, o graveto', () => {
    expect(melhorArma({ graveto_reforcado: 1 })).toBe('graveto_reforcado');
  });

  it('com as duas, a que bate mais forte', () => {
    expect(melhorArma({ graveto_reforcado: 1, arma_nv2: 1 })).toBe('arma_nv2');
    expect(danoDaArma(melhorArma({ graveto_reforcado: 1, arma_nv2: 1 }))).toBe(2);
  });

  it('arma com quantidade zero não conta', () => {
    expect(melhorArma({ graveto_reforcado: 1, arma_nv2: 0 })).toBe('graveto_reforcado');
  });

  it('todo item que bate tem dano declarado no conteúdo', () => {
    for (const id of ['graveto_reforcado', 'arma_nv2']) {
      expect(getItem(id).efeito?.dano, id).toBe(danoDaArma(id));
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
      // Posições medidas a partir do alcance, para o teste não depender de um
      // número solto que muda quando o golpe é reajustado.
      { id: 'longe', x: 0.5, y: 0, z: ATTACK_REACH + 0.3 },
      { id: 'perto', x: 0, y: 0, z: ATTACK_REACH - 0.1 },
    ];
    expect(alvosAtingidos(origem, 0, alvos).map((a) => a.id)).toEqual(['perto', 'longe']);
  });

  it('inimigo voando alto escapa do golpe', () => {
    const centro = centroDoGolpe(origem, 0);
    expect(dentroDaEsfera(centro, { x: 0, y: 0, z: 1.6 }, 0.9)).toBe(true);
    expect(dentroDaEsfera(centro, { x: 0, y: 4, z: 1.6 }, 0.9)).toBe(false);
  });
});

describe('alcance generoso do golpe', () => {
  const origem = { x: 0, y: 0, z: 0 };

  it('no chão o raio perdoa mira torta, mas a altura continua honesta', () => {
    const centro = centroDoGolpe(origem, 0);
    // Lado a lado, quase na borda do raio.
    expect(
      dentroDaEsfera(centro, { x: ATTACK_RADIUS - 0.1, y: 0, z: centro.z }, ATTACK_RADIUS),
    ).toBe(true);
    // O mosquito orbita a 1,9 m: quem está no chão não o alcança.
    expect(dentroDaEsfera(centro, { x: 0, y: 1.9, z: centro.z }, ATTACK_RADIUS)).toBe(false);
  });

  it('o carregado pega em volta do jogador, inclusive quem está atrás', () => {
    const alvos = [
      { id: 'frente', x: 0, y: 0, z: 2 },
      { id: 'atras', x: 0, y: 0, z: -2 },
      { id: 'longe', x: 0, y: 0, z: 6 },
    ];
    const pegos = alvosAtingidos(origem, 0, alvos, CHARGED_REACH, CHARGED_RADIUS);
    expect(pegos.map((a) => a.id).sort()).toEqual(['atras', 'frente']);
    // O golpe normal não alcança quem está atrás.
    expect(alvosAtingidos(origem, 0, alvos).map((a) => a.id)).not.toContain('atras');
  });
});

describe('empurrão do golpe carregado', () => {
  const nenhuma: never[] = [];

  it('joga o alvo para longe do atacante, em linha reta', () => {
    const fim = empurrar({ x: 0, y: 0, z: 0 }, 0, { x: 0, y: 0, z: 1 }, nenhuma);
    expect(fim.x).toBeCloseTo(0, 6);
    expect(fim.z).toBeCloseTo(1 + CHARGED_KNOCKBACK, 6);
  });

  it('colado no atacante, vai para onde o golpe aponta', () => {
    const fim = empurrar({ x: 0, y: 0, z: 0 }, Math.PI / 2, { x: 0, y: 0, z: 0 }, nenhuma);
    expect(fim.x).toBeCloseTo(CHARGED_KNOCKBACK, 6);
    expect(fim.z).toBeCloseTo(0, 6);
  });

  it('a parede segura o alvo: ele não atravessa', () => {
    const parede = boxFromCenter(0, 1, 4, 10, 2, 1);
    const fim = empurrar({ x: 0, y: 0, z: 0 }, 0, { x: 0, y: 0, z: 1 }, [parede]);
    expect(fim.z).toBeLessThan(4 - 0.5);
    expect(fim.z).toBeGreaterThan(1);
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

describe('mergulho (ataque no ar)', () => {
  it('tira mais que o golpe normal, arredondado para cima', () => {
    expect(danoDoGolpe('graveto_reforcado', 'plunge')).toBe(2);
    expect(danoDoGolpe('arma_nv2', 'plunge')).toBe(3);
    expect(danoDoGolpe('graveto_reforcado', 'plunge')).toBeGreaterThan(
      danoDoGolpe('graveto_reforcado', 'attack1'),
    );
  });

  it('bate em volta de onde pousou, inclusive atrás', () => {
    const { alcance, raio } = areaDoGolpe('plunge');
    const origem = { x: 0, y: 0, z: 0 };
    const alvos = [
      { id: 'frente', x: 0, y: 0, z: 1.5 },
      { id: 'atras', x: 0, y: 0, z: -1.5 },
      { id: 'longe', x: 0, y: 0, z: 5 },
    ];
    const pegos = alvosAtingidos(origem, 0, alvos, alcance, raio).map((a) => a.id);
    expect(pegos.sort()).toEqual(['atras', 'frente']);
  });

  it('empurra, mas menos que o carregado', () => {
    expect(empurraoDoGolpe('plunge')).toBeGreaterThan(0);
    expect(empurraoDoGolpe('plunge')).toBeLessThan(empurraoDoGolpe('charged'));
    expect(empurraoDoGolpe('attack1')).toBe(0);
  });
});

describe('arma na mão', () => {
  const ambas = { graveto_reforcado: 1, arma_nv2: 1 };

  it('sem escolha, usa a melhor que tiver', () => {
    expect(armaEmUso(ambas, null)).toBe('arma_nv2');
  });

  it('a escolhida vale, mesmo sendo a mais fraca', () => {
    expect(armaEmUso(ambas, 'graveto_reforcado')).toBe('graveto_reforcado');
  });

  it('se a escolhida saiu do inventário, volta para a melhor', () => {
    expect(armaEmUso({ arma_nv2: 1 }, 'graveto_reforcado')).toBe('arma_nv2');
  });

  it('item que não é arma não fica na mão', () => {
    expect(armaEmUso({ ...ambas, pocao_pequena: 2 }, 'pocao_pequena')).toBe('arma_nv2');
  });
});
