/**
 * Colisão por caixas alinhadas aos eixos (AABB).
 *
 * O corpo do jogador é aproximado por uma caixa (lado 2 × raio). É grosseiro
 * de propósito: o mesmo código roda no cliente (predição) e no servidor
 * (validação), então precisa ser determinístico e barato. As esferas presas aos
 * ossos da SPEC §6 são para dano (M3), não para movimento.
 */

/** Caixa alinhada aos eixos. */
export interface Box {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
}

export type Axis = 'x' | 'y' | 'z';

/** Encostar não conta como sobrepor. */
const TOUCH_EPS = 1e-4;

const MIN = { x: 'minX', y: 'minY', z: 'minZ' } as const;
const MAX = { x: 'maxX', y: 'maxY', z: 'maxZ' } as const;
const OTHER_AXES: Record<Axis, readonly [Axis, Axis]> = {
  x: ['y', 'z'],
  y: ['x', 'z'],
  z: ['x', 'y'],
};

export function boxFromCenter(
  centerX: number,
  centerY: number,
  centerZ: number,
  sizeX: number,
  sizeY: number,
  sizeZ: number,
): Box {
  return {
    minX: centerX - sizeX / 2,
    minY: centerY - sizeY / 2,
    minZ: centerZ - sizeZ / 2,
    maxX: centerX + sizeX / 2,
    maxY: centerY + sizeY / 2,
    maxZ: centerZ + sizeZ / 2,
  };
}

/** Caixa do corpo a partir dos pés (x, y, z é o centro da base). */
export function bodyBox(x: number, y: number, z: number, radius: number, height: number): Box {
  return {
    minX: x - radius,
    minY: y,
    minZ: z - radius,
    maxX: x + radius,
    maxY: y + height,
    maxZ: z + radius,
  };
}

export function translate(box: Box, axis: Axis, amount: number): Box {
  return { ...box, [MIN[axis]]: box[MIN[axis]] + amount, [MAX[axis]]: box[MAX[axis]] + amount };
}

function overlapsOnAxis(a: Box, b: Box, axis: Axis): boolean {
  return a[MIN[axis]] < b[MAX[axis]] - TOUCH_EPS && b[MIN[axis]] < a[MAX[axis]] - TOUCH_EPS;
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return overlapsOnAxis(a, b, 'x') && overlapsOnAxis(a, b, 'y') && overlapsOnAxis(a, b, 'z');
}

export function overlapsAny(body: Box, boxes: readonly Box[]): boolean {
  return boxes.some((box) => boxesOverlap(body, box));
}

/**
 * Quanto o corpo consegue andar em um eixo antes de encostar em algo.
 * Devolve `amount` se o caminho está livre, ou a folga até o obstáculo.
 *
 * Só obstáculos à frente contam: uma caixa atrás (o chão, ao pular) tem folga
 * negativa e é ignorada. Corpo já penetrado também não trava, senão o jogador
 * ficaria preso dentro do cenário.
 */
export function sweepAxis(body: Box, axis: Axis, amount: number, boxes: readonly Box[]): number {
  if (amount === 0) return 0;
  const [p, q] = OTHER_AXES[axis];
  let allowed = amount;
  for (const box of boxes) {
    if (!overlapsOnAxis(body, box, p) || !overlapsOnAxis(body, box, q)) continue;
    if (amount > 0) {
      const gap = box[MIN[axis]] - body[MAX[axis]];
      if (gap >= 0 && gap < allowed) allowed = gap;
    } else {
      const gap = box[MAX[axis]] - body[MIN[axis]];
      if (gap <= 0 && gap > allowed) allowed = gap;
    }
  }
  return allowed;
}

/**
 * Distância livre de um raio até a primeira caixa (caixas infladas por
 * `radius`). Usado pela câmera em terceira pessoa para não atravessar parede
 * (SPEC §6). `dir` precisa ser unitário.
 */
export function rayDistance(
  originX: number,
  originY: number,
  originZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  maxDistance: number,
  boxes: readonly Box[],
  radius = 0,
): number {
  const origin = [originX, originY, originZ] as const;
  const dir = [dirX, dirY, dirZ] as const;
  let nearest = maxDistance;

  for (const box of boxes) {
    const lo = [box.minX - radius, box.minY - radius, box.minZ - radius] as const;
    const hi = [box.maxX + radius, box.maxY + radius, box.maxZ + radius] as const;
    let enter = 0;
    let exit = nearest;
    let miss = false;

    for (let i = 0; i < 3; i += 1) {
      const o = origin[i] ?? 0;
      const d = dir[i] ?? 0;
      const min = lo[i] ?? 0;
      const max = hi[i] ?? 0;
      if (Math.abs(d) < 1e-9) {
        if (o < min || o > max) {
          miss = true;
          break;
        }
        continue;
      }
      const t1 = (min - o) / d;
      const t2 = (max - o) / d;
      enter = Math.max(enter, Math.min(t1, t2));
      exit = Math.min(exit, Math.max(t1, t2));
      if (enter > exit) {
        miss = true;
        break;
      }
    }

    if (!miss && enter < nearest) nearest = enter;
  }

  return nearest;
}
