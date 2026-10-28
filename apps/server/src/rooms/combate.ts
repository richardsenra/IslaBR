import { getEnemy } from '@islabr/content';
import {
  alvosAtingidos,
  areaDoGolpe,
  danoNoJogador,
  golpeDeFrente,
  resolverGolpe,
  rolarDrops,
  type AttackKind,
  type Saque,
  type Sorteio,
} from '@islabr/shared';
import { levarGolpe, type EnemyRuntime } from './enemyAI.js';

export interface AcertoNoInimigo {
  readonly inimigo: EnemyRuntime;
  readonly dano: number;
  readonly morreu: boolean;
  readonly saque: Saque | null;
}

export interface ResultadoDoAtaque {
  readonly acertos: readonly AcertoNoInimigo[];
  /** Dano que voltou no jogador, em corações (caranguejo espinhoso). */
  readonly refletido: number;
}

export interface Atacante {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly arma: string | null;
}

/** Inimigos que um golpe pega, e o que acontece com cada um. */
export function resolverAtaque(
  atacante: Atacante,
  golpe: AttackKind,
  inimigos: readonly EnemyRuntime[],
  sorteio: Sorteio,
): ResultadoDoAtaque {
  const vivos = inimigos.filter((inimigo) => inimigo.estado !== 'morto' && !inimigo.invulneravel);

  const { alcance, raio } = areaDoGolpe(golpe);

  const alvos = alvosAtingidos(
    atacante,
    atacante.yaw,
    vivos.map((inimigo) => ({ id: inimigo.id, x: inimigo.x, y: inimigo.y, z: inimigo.z })),
    alcance,
    raio,
  );

  const acertos: AcertoNoInimigo[] = [];
  let refletido = 0;

  for (const alvo of alvos) {
    const inimigo = vivos.find((candidato) => candidato.id === alvo.id);
    if (!inimigo) continue;

    const def = getEnemy(inimigo.tipo);
    // O espinhoso devolve o golpe de frente (SPEC §7.6); quem reflete é dado do
    // inimigo no JSON, não um id escrito aqui.
    const reflete = def.ia?.tipo === 'perseguidor' && def.ia.reflete_de_frente;
    const resultado = resolverGolpe({
      arma: atacante.arma,
      golpe,
      refleteDeFrente: reflete,
      deFrente: reflete && golpeDeFrente(atacante, inimigo, inimigo.yaw),
      danoDoInimigo: def.dano,
    });

    refletido += resultado.refletido;
    const morreu = resultado.dano > 0 ? levarGolpe(inimigo, resultado.dano) : false;
    acertos.push({
      inimigo,
      dano: resultado.dano,
      morreu,
      saque: morreu ? rolarDrops(def, sorteio) : null,
    });
  }

  return { acertos, refletido };
}

/** Dano que um jogador leva, já contando esquiva e armadura. */
export function danoRecebido(opcoes: {
  readonly dano: number;
  readonly invulneravel: boolean;
  readonly temArmadura: boolean;
}): number {
  return danoNoJogador({
    dano: opcoes.dano,
    invulneravel: opcoes.invulneravel,
    reducao: opcoes.temArmadura ? 0.5 : 0,
  });
}
