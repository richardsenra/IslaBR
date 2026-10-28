import { getResource, type Resource } from '@islabr/content';
import {
  CHOP_RADIUS,
  CHOP_REACH,
  alvosAtingidos,
  cortaMadeira,
  rolarDropsDeRecurso,
  type Saque,
  type Sorteio,
  type TreeSpawn,
} from '@islabr/shared';

/**
 * Árvores cortáveis (mecânica nova; a SPEC §6 não a prevê). Quem conta os
 * golpes e sorteia a madeira é o servidor, como com inimigo e baú (SPEC §4).
 * Separado da sala para dar para testar sem subir servidor.
 */

export interface ArvoreRuntime {
  readonly id: string;
  /** Id do recurso em content/resources.json. */
  readonly tipo: string;
  readonly x: number;
  readonly z: number;
  /** Golpes que faltam até cair. Zero é árvore no chão. */
  golpes: number;
  /** Segundos até voltar em pé; zero quando está em pé. */
  volta: number;
}

export function criarArvore(spawn: TreeSpawn): ArvoreRuntime {
  return {
    id: spawn.id,
    tipo: spawn.tipo,
    x: spawn.x,
    z: spawn.z,
    golpes: getResource(spawn.tipo).golpes,
    volta: 0,
  };
}

export const emPe = (arvore: ArvoreRuntime): boolean => arvore.golpes > 0;

export interface AcertoNaArvore {
  readonly arvore: ArvoreRuntime;
  readonly recurso: Resource;
  /** A árvore caiu com este golpe. */
  readonly caiu: boolean;
  readonly saque: Saque | null;
}

export interface Cortador {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly arma: string | null;
}

/**
 * O golpe acertou alguma árvore? Só a mais próxima leva: ao contrário do golpe
 * em bicho, que pega vários, um machado derruba uma árvore de cada vez.
 *
 * Sem ferramenta que corte, o golpe não faz nada: a árvore não é inimigo, e
 * bater nela com a espada não deveria render madeira.
 */
export function cortar(
  cortador: Cortador,
  arvores: readonly ArvoreRuntime[],
  sorteio: Sorteio,
): AcertoNaArvore | null {
  if (!cortaMadeira(cortador.arma)) return null;

  const alvos = alvosAtingidos(
    cortador,
    cortador.yaw,
    arvores.filter(emPe).map((arvore) => ({
      id: arvore.id,
      x: arvore.x,
      // O golpe acerta o tronco na altura do peito, não o pé da árvore.
      y: cortador.y,
      z: arvore.z,
    })),
    CHOP_REACH,
    CHOP_RADIUS,
  );

  const alvo = alvos[0];
  if (!alvo) return null;
  const arvore = arvores.find((candidata) => candidata.id === alvo.id);
  if (!arvore) return null;

  const recurso = getResource(arvore.tipo);
  arvore.golpes -= 1;
  if (arvore.golpes > 0) return { arvore, recurso, caiu: false, saque: null };

  arvore.golpes = 0;
  arvore.volta = recurso.volta_s;
  return { arvore, recurso, caiu: true, saque: rolarDropsDeRecurso(recurso, sorteio) };
}

/**
 * Passa o tempo das árvores caídas. Devolve as que acabaram de voltar em pé,
 * para a sala replicar o estado novo.
 */
export function passarOTempo(
  arvores: Iterable<ArvoreRuntime>,
  dt: number,
): readonly ArvoreRuntime[] {
  const voltaram: ArvoreRuntime[] = [];
  for (const arvore of arvores) {
    if (emPe(arvore)) continue;
    arvore.volta -= dt;
    if (arvore.volta > 0) continue;
    arvore.volta = 0;
    arvore.golpes = getResource(arvore.tipo).golpes;
    voltaram.push(arvore);
  }
  return voltaram;
}
