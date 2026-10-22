import { describe, expect, it } from 'vitest';
import {
  bodyBox,
  boxFromCenter,
  boxesOverlap,
  overlapsAny,
  rayDistance,
  sweepAxis,
  translate,
} from './collision.js';

const unitBox = boxFromCenter(0, 0, 0, 2, 2, 2);

describe('AABB', () => {
  it('encostar não conta como sobrepor', () => {
    expect(boxesOverlap(unitBox, boxFromCenter(2, 0, 0, 2, 2, 2))).toBe(false);
    expect(boxesOverlap(unitBox, boxFromCenter(1.9, 0, 0, 2, 2, 2))).toBe(true);
  });

  it('desloca em um eixo só', () => {
    const moved = translate(unitBox, 'y', 3);
    expect(moved.minY).toBe(2);
    expect(moved.maxY).toBe(4);
    expect(moved.minX).toBe(unitBox.minX);
  });

  it('overlapsAny vê qualquer caixa da lista', () => {
    const body = bodyBox(0, 0, 0, 0.4, 1.7);
    expect(overlapsAny(body, [boxFromCenter(10, 0, 0, 1, 1, 1)])).toBe(false);
    expect(overlapsAny(body, [boxFromCenter(10, 0, 0, 1, 1, 1), unitBox])).toBe(true);
  });
});

describe('sweepAxis', () => {
  const wall = boxFromCenter(5, 1, 0, 1, 2, 10);
  const body = bodyBox(0, 0, 0, 0.4, 1.7);

  it('deixa passar quando o caminho está livre', () => {
    expect(sweepAxis(body, 'x', 1, [wall])).toBe(1);
  });

  it('para na folga até o obstáculo', () => {
    // Parede começa em x = 4,5; a lateral do corpo está em 0,4.
    expect(sweepAxis(body, 'x', 10, [wall])).toBeCloseTo(4.1, 6);
  });

  it('ignora obstáculo fora do alcance nos outros eixos', () => {
    const highWall = boxFromCenter(5, 10, 0, 1, 2, 10);
    expect(sweepAxis(body, 'x', 10, [highWall])).toBe(10);
  });

  it('não trava um corpo já penetrado', () => {
    const inside = bodyBox(5, 0, 0, 0.4, 1.7);
    expect(sweepAxis(inside, 'x', 1, [wall])).toBe(1);
    expect(sweepAxis(inside, 'x', -1, [wall])).toBe(-1);
  });

  it('ignora obstáculo que está atrás do movimento', () => {
    const behind = boxFromCenter(-5, 1, 0, 1, 2, 10);
    expect(sweepAxis(body, 'x', 10, [behind])).toBe(10);
    const floor = boxFromCenter(0, -0.5, 0, 100, 1, 100);
    expect(sweepAxis(body, 'y', 2, [floor])).toBe(2);
  });

  it('aceita movimento para trás até a folga', () => {
    const near = bodyBox(0, 0, 0, 0.4, 1.7);
    const back = boxFromCenter(-5, 1, 0, 1, 2, 10);
    expect(sweepAxis(near, 'x', -10, [back])).toBeCloseTo(-4.1, 6);
  });
});

describe('rayDistance', () => {
  const box = boxFromCenter(0, 0, -5, 4, 4, 1);

  it('encontra a primeira caixa no caminho', () => {
    expect(rayDistance(0, 0, 0, 0, 0, -1, 20, [box])).toBeCloseTo(4.5, 6);
  });

  it('devolve a distância máxima quando não acerta nada', () => {
    expect(rayDistance(0, 0, 0, 1, 0, 0, 20, [box])).toBe(20);
  });

  it('infla as caixas pelo raio da câmera', () => {
    expect(rayDistance(0, 0, 0, 0, 0, -1, 20, [box], 0.3)).toBeCloseTo(4.2, 6);
  });

  it('pega a caixa mais próxima entre várias', () => {
    const near = boxFromCenter(0, 0, -2, 4, 4, 1);
    expect(rayDistance(0, 0, 0, 0, 0, -1, 20, [box, near])).toBeCloseTo(1.5, 6);
  });
});
