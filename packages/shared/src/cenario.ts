/**
 * Cenário: os modelos que enfeitam a ilha (world.json). Nada aqui colide; a
 * colisão é das peças. Fica em `shared` porque o sorteio é puro e tem teste, e
 * porque a regra de "não nasce em cima de coisa" usa os mesmos colisores.
 */

import { content, type WorldScatter } from '@islabr/content';
import { ARENA_COLLIDERS, ARENA_SPOTS, ARENA_TREES } from './arena.js';
import { sorteioComSemente, type Sorteio } from './drops.js';

export interface Colocacao {
  readonly modelo: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly giro: number;
  readonly escala: number;
  readonly escalaY: number;
}

export interface Obstaculo {
  readonly x: number;
  readonly z: number;
  /** Meia-largura do obstáculo em x e em z. */
  readonly meioX: number;
  readonly meioZ: number;
}

/** Sorteia os pontos de uma dispersão, fora de qualquer obstáculo. */
export function espalhar(
  dispersao: WorldScatter,
  obstaculos: readonly Obstaculo[],
  sorteio: Sorteio = sorteioComSemente(dispersao.semente),
): Colocacao[] {
  const colocacoes: Colocacao[] = [];
  const [escalaMin, escalaMax] = dispersao.escala;
  // Tenta mais vezes do que a quantidade pedida; área cheia entrega menos.
  const tentativas = dispersao.quantidade * 12;
  for (let i = 0; i < tentativas && colocacoes.length < dispersao.quantidade; i += 1) {
    const x = dispersao.minX + sorteio() * (dispersao.maxX - dispersao.minX);
    const z = dispersao.minZ + sorteio() * (dispersao.maxZ - dispersao.minZ);
    const modelo = dispersao.modelos[Math.floor(sorteio() * dispersao.modelos.length)];
    const giro = sorteio() * Math.PI * 2;
    const escala = escalaMin + sorteio() * (escalaMax - escalaMin);
    if (modelo === undefined) continue;
    const bate = obstaculos.some(
      (o) =>
        Math.abs(x - o.x) < o.meioX + dispersao.folga &&
        Math.abs(z - o.z) < o.meioZ + dispersao.folga,
    );
    if (bate) continue;
    colocacoes.push({ modelo, x, y: 0, z, giro, escala, escalaY: escala });
  }
  return colocacoes;
}

function obstaculosDaIlha(): Obstaculo[] {
  const lista: Obstaculo[] = [];
  for (const caixa of ARENA_COLLIDERS) {
    // O chão (topo em y = 0) não atrapalha: só o que está em cima dele.
    if (caixa.maxY <= 0) continue;
    lista.push({
      x: (caixa.minX + caixa.maxX) / 2,
      z: (caixa.minZ + caixa.maxZ) / 2,
      meioX: (caixa.maxX - caixa.minX) / 2,
      meioZ: (caixa.maxZ - caixa.minZ) / 2,
    });
  }
  for (const spot of ARENA_SPOTS) {
    lista.push({ x: spot.x, z: spot.z, meioX: 1, meioZ: 1 });
  }
  for (const arvore of ARENA_TREES) {
    lista.push({ x: arvore.x, z: arvore.z, meioX: 0.8, meioZ: 0.8 });
  }
  return lista;
}

/** Tudo o que o cliente desenha como enfeite: o que está escrito e o sorteado. */
export function colocacoesDoCenario(): Colocacao[] {
  const escritas: Colocacao[] = content.world.decoracao.map((d) => ({
    modelo: d.modelo,
    x: d.x,
    y: d.y,
    z: d.z,
    giro: d.giro,
    escala: d.escala,
    escalaY: d.escalaY ?? d.escala,
  }));
  const obstaculos = obstaculosDaIlha();
  const sorteadas = content.world.dispersoes.flatMap((d) => espalhar(d, obstaculos));
  return [...escritas, ...sorteadas];
}
