import { describe, expect, it } from 'vitest';
import { ARENA_COLLIDERS } from './arena.js';
import { boxFromCenter, type Box } from './collision.js';
import {
  DODGE_COOLDOWN,
  DODGE_INVULN,
  DODGE_SPEED,
  GRAVITY,
  JUMP_SPEED,
  MAX_FALL_SPEED,
  MAX_STEP_SECONDS,
  MOVE_SPEED,
  PLAYER_RADIUS,
  PLUNGE_MIN_HEIGHT,
  alturaAcimaDoChao,
  lerpAngle,
  moveDirectionFromCamera,
  spawnPhysics,
  stepPlayer,
  turnToward,
  wrapAngle,
  type MoveInput,
  type PlayerPhysics,
} from './movement.js';

const STEP = 1 / 60;
const FLOOR: readonly Box[] = [boxFromCenter(0, -0.5, 0, 100, 1, 100)];

function input(partial: Partial<MoveInput> = {}, seq = 0): MoveInput {
  return { seq, dt: STEP, moveX: 0, moveZ: 0, jump: false, dodge: false, ...partial };
}

/** Roda `frames` passos de 1/60 s com a mesma entrada. */
function run(
  start: PlayerPhysics,
  frames: number,
  partial: Partial<MoveInput> = {},
  boxes: readonly Box[] = FLOOR,
): PlayerPhysics {
  let physics = start;
  for (let i = 0; i < frames; i += 1) {
    physics = stepPlayer(physics, input(partial, i), boxes);
  }
  return physics;
}

/** Jogador já parado no chão, pronto para o teste. */
function grounded(boxes: readonly Box[] = FLOOR, x = 0, z = 0): PlayerPhysics {
  return run(spawnPhysics(x, 1, z), 30, {}, boxes);
}

describe('gravidade e chão', () => {
  it('cai e para em cima do chão', () => {
    const player = grounded();
    expect(player.y).toBeCloseTo(0, 6);
    expect(player.onGround).toBe(true);
    expect(player.vy).toBe(0);
    expect(player.state).toBe('idle');
  });

  it('acelera para baixo enquanto está no ar', () => {
    const falling = run(spawnPhysics(0, 10), 6);
    expect(falling.vy).toBeCloseTo(-GRAVITY * 6 * STEP, 6);
    expect(falling.state).toBe('fall');
  });

  it('um passo gigante é recortado em MAX_STEP_SECONDS', () => {
    const player = stepPlayer(spawnPhysics(0, 2), input({ dt: 5 }), FLOOR);
    expect(player.vy).toBeCloseTo(-GRAVITY * MAX_STEP_SECONDS, 6);
    expect(player.y).toBeLessThan(2);
    expect(player.y).toBeGreaterThan(0);
  });

  it('caindo na velocidade máxima, não atravessa uma plataforma fina', () => {
    const thin = boxFromCenter(0, 5.1, 0, 6, 0.2, 6);
    let player = { ...spawnPhysics(0, 6), vy: -MAX_FALL_SPEED };
    for (let i = 0; i < 10; i += 1) {
      player = stepPlayer(player, input({ dt: MAX_STEP_SECONDS }, i), [thin]);
    }
    expect(player.y).toBeCloseTo(5.2, 6);
    expect(player.onGround).toBe(true);
  });
});

describe('corrida', () => {
  it('anda à velocidade da SPEC na direção pedida', () => {
    const start = grounded();
    const after = run(start, 60, { moveZ: 1 });
    expect(after.z - start.z).toBeCloseTo(MOVE_SPEED, 1);
    expect(after.state).toBe('run');
    expect(after.yaw).toBeCloseTo(0, 6);
  });

  it('não ganha velocidade na diagonal', () => {
    const after = run(grounded(), 60, { moveX: 1, moveZ: 1 });
    expect(Math.hypot(after.vx, after.vz)).toBeCloseTo(MOVE_SPEED, 6);
  });

  it('respeita entrada analógica parcial', () => {
    const after = run(grounded(), 30, { moveZ: 0.5 });
    expect(Math.hypot(after.vx, after.vz)).toBeCloseTo(MOVE_SPEED * 0.5, 6);
  });

  it('gira para a direção do movimento', () => {
    const after = run(grounded(), 60, { moveX: 1 });
    expect(after.yaw).toBeCloseTo(Math.PI / 2, 2);
  });
});

describe('pulo', () => {
  it('sobe cerca de 1,36 m e volta ao chão', () => {
    let player = stepPlayer(grounded(), input({ jump: true }), FLOOR);
    let peak = player.y;
    for (let i = 0; i < 120; i += 1) {
      player = stepPlayer(player, input({}, i), FLOOR);
      peak = Math.max(peak, player.y);
    }
    // A altura teórica é 1,36 m; a 60 Hz a integração perde um pouco.
    const ideal = (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY);
    expect(peak).toBeGreaterThan(ideal * 0.9);
    expect(peak).toBeLessThanOrEqual(ideal);
    expect(player.onGround).toBe(true);
    expect(player.y).toBeCloseTo(0, 6);
  });

  it('não pula duas vezes no ar', () => {
    const jumping = stepPlayer(grounded(), input({ jump: true }), FLOOR);
    expect(jumping.state).toBe('jump');
    const again = stepPlayer(jumping, input({ jump: true }), FLOOR);
    expect(again.vy).toBeLessThan(jumping.vy);
  });

  it('sobe em cima de uma caixa', () => {
    // Caixa de 1,2 m de altura em x de 1,2 a 2,8.
    const crate = boxFromCenter(2, 0.6, 0, 1.6, 1.2, 1.6);
    const boxes = [...FLOOR, crate];
    let player = stepPlayer(grounded(boxes), input({ jump: true, moveX: 1 }), boxes);
    player = run(player, 32, { moveX: 1 }, boxes);
    expect(player.y).toBeCloseTo(1.2, 6);

    // Soltando o controle, continua em pé na caixa.
    player = run(player, 20, {}, boxes);
    expect(player.y).toBeCloseTo(1.2, 6);
    expect(player.onGround).toBe(true);
    expect(player.state).toBe('idle');
  });
});

describe('esquiva', () => {
  it('dispara na velocidade de esquiva e dá invulnerabilidade curta', () => {
    const dodging = stepPlayer(grounded(), input({ dodge: true, moveZ: 1 }), FLOOR);
    expect(dodging.state).toBe('dodge');
    expect(Math.hypot(dodging.vx, dodging.vz)).toBeCloseTo(DODGE_SPEED, 6);
    expect(dodging.invulnTime).toBeCloseTo(DODGE_INVULN, 6);
  });

  it('a invulnerabilidade acaba antes da esquiva', () => {
    const player = run(grounded(), 20, { dodge: true, moveZ: 1 });
    expect(player.invulnTime).toBe(0);
    expect(player.state).toBe('dodge');
  });

  it('usa o rumo atual quando não há direção', () => {
    const facing = { ...grounded(), yaw: Math.PI / 2 };
    const dodging = stepPlayer(facing, input({ dodge: true }), FLOOR);
    expect(dodging.vx).toBeCloseTo(DODGE_SPEED, 6);
    expect(dodging.vz).toBeCloseTo(0, 6);
  });

  it('recarrega por 1,2 s antes da próxima', () => {
    const first = stepPlayer(grounded(), input({ dodge: true, moveZ: 1 }), FLOOR);
    expect(first.dodgeCooldown).toBeCloseTo(DODGE_COOLDOWN, 6);

    // Logo depois do fim da esquiva, ainda em recarga.
    const early = run(first, 30, { dodge: true, moveZ: 1 });
    expect(early.state).not.toBe('dodge');

    const ready = run(early, 60, { moveZ: 1 });
    expect(ready.dodgeCooldown).toBe(0);
    const second = stepPlayer(ready, input({ dodge: true, moveZ: 1 }), FLOOR);
    expect(second.state).toBe('dodge');
  });

  it('não esquiva no ar', () => {
    const jumping = stepPlayer(grounded(), input({ jump: true }), FLOOR);
    const tryDodge = stepPlayer(jumping, input({ dodge: true, moveZ: 1 }), FLOOR);
    expect(tryDodge.state).not.toBe('dodge');
  });
});

describe('colisão do corpo', () => {
  const wall = boxFromCenter(3, 2, 0, 1, 4, 20);
  const boxes = [...FLOOR, wall];

  it('para na parede', () => {
    const player = run(grounded(boxes), 120, { moveX: 1 }, boxes);
    expect(player.x).toBeCloseTo(2.5 - PLAYER_RADIUS, 4);
  });

  it('desliza na parede sem perder o movimento paralelo', () => {
    const start = grounded(boxes);
    const player = run(start, 60, { moveX: 1, moveZ: 1 }, boxes);
    expect(player.x).toBeCloseTo(2.5 - PLAYER_RADIUS, 4);
    expect(player.z - start.z).toBeGreaterThan(2);
  });
});

describe('vão baixo da arena', () => {
  // Laje em x de -10 a -6, com 1 m de vão livre.
  const start = (): PlayerPhysics => ({
    ...grounded(ARENA_COLLIDERS, -13, 0),
    yaw: Math.PI / 2,
  });

  it('em pé, o jogador bate na laje', () => {
    const player = run(start(), 180, { moveX: 1 }, ARENA_COLLIDERS);
    expect(player.x).toBeLessThan(-10);
  });

  it('rolando, o jogador atravessa e só levanta quando cabe', () => {
    let player = run(start(), 120, { moveX: 1 }, ARENA_COLLIDERS);
    player = stepPlayer(player, input({ moveX: 1, dodge: true }), ARENA_COLLIDERS);
    expect(player.state).toBe('dodge');
    player = run(player, 120, { moveX: 1 }, ARENA_COLLIDERS);
    expect(player.x).toBeGreaterThan(-6 + PLAYER_RADIUS);
    expect(player.state).not.toBe('dodge');
  });
});

describe('determinismo', () => {
  it('a mesma sequência de comandos dá o mesmo resultado', () => {
    const commands = Array.from({ length: 200 }, (_, i) =>
      input(
        {
          moveX: Math.sin(i / 7),
          moveZ: Math.cos(i / 11),
          jump: i % 37 === 0,
          dodge: i % 53 === 0,
        },
        i,
      ),
    );
    const play = (): PlayerPhysics =>
      commands.reduce(
        (physics, cmd) => stepPlayer(physics, cmd, ARENA_COLLIDERS),
        spawnPhysics(0, 1, 8),
      );
    expect(play()).toEqual(play());
  });
});

describe('ângulos', () => {
  it('wrapAngle fica em [-π, π)', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(-Math.PI, 6);
    expect(wrapAngle(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2, 6);
  });

  it('turnToward pega o caminho curto', () => {
    // De 3 para -3 o caminho curto cruza o ±π e tem só 0,28 rad.
    expect(turnToward(3, -3, 1)).toBeCloseTo(-3, 6);
    expect(turnToward(3, -3, 0.1)).toBeCloseTo(3.1, 6);
    expect(turnToward(0, 0.1, 1)).toBeCloseTo(0.1, 6);
  });

  it('lerpAngle cruza o -π sem voltar', () => {
    expect(Math.abs(lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5))).toBeCloseTo(Math.PI, 6);
  });
});

describe('moveDirectionFromCamera', () => {
  it('com a câmera olhando para +Z, andar para frente vai para +Z', () => {
    const dir = moveDirectionFromCamera(1, 0, 0);
    expect(dir.x).toBeCloseTo(0, 6);
    expect(dir.z).toBeCloseTo(1, 6);
  });

  it('a direita da tela é -X quando a câmera olha para +Z', () => {
    const dir = moveDirectionFromCamera(0, 1, 0);
    expect(dir.x).toBeCloseTo(-1, 6);
    expect(dir.z).toBeCloseTo(0, 6);
  });

  it('acompanha o giro da câmera', () => {
    const dir = moveDirectionFromCamera(1, 0, Math.PI / 2);
    expect(dir.x).toBeCloseTo(1, 6);
    expect(dir.z).toBeCloseTo(0, 6);
  });

  it('o resultado alimenta o yaw do personagem sem conversão', () => {
    const dir = moveDirectionFromCamera(1, 0, 1.2);
    const player = run(grounded(), 60, { moveX: dir.x, moveZ: dir.z });
    expect(player.yaw).toBeCloseTo(1.2, 3);
  });

  it('a diagonal não passa de 1 depois de normalizada', () => {
    const dir = moveDirectionFromCamera(1, 1, 0.7);
    const player = run(grounded(), 30, { moveX: dir.x, moveZ: dir.z });
    expect(Math.hypot(player.vx, player.vz)).toBeCloseTo(MOVE_SPEED, 6);
  });
});

describe('lentidão (gosma do sapo)', () => {
  it('speedScale reduz a velocidade de corrida', () => {
    const normal = run(grounded(), 30, { moveZ: 1 });
    const lento = run(grounded(), 30, { moveZ: 1, speedScale: 0.5 });
    expect(Math.hypot(lento.vx, lento.vz)).toBeCloseTo(MOVE_SPEED * 0.5, 6);
    expect(Math.hypot(normal.vx, normal.vz)).toBeCloseTo(MOVE_SPEED, 6);
  });

  it('sem speedScale, anda na velocidade cheia', () => {
    const player = run(grounded(), 30, { moveZ: 1 });
    expect(Math.hypot(player.vx, player.vz)).toBeCloseTo(MOVE_SPEED, 6);
  });

  it('a escala é limitada a [0, 1]: nenhum cliente corre mais que o normal', () => {
    const rapido = run(grounded(), 30, { moveZ: 1, speedScale: 5 });
    expect(Math.hypot(rapido.vx, rapido.vz)).toBeCloseTo(MOVE_SPEED, 6);
    const parado = run(grounded(), 30, { moveZ: 1, speedScale: -1 });
    expect(Math.hypot(parado.vx, parado.vz)).toBe(0);
  });

  it('a esquiva não é freada pela gosma', () => {
    const dodging = stepPlayer(
      grounded(),
      input({ dodge: true, moveZ: 1, speedScale: 0.2 }),
      FLOOR,
    );
    expect(Math.hypot(dodging.vx, dodging.vz)).toBeCloseTo(DODGE_SPEED, 6);
  });
});

describe('mergulho (ataque no ar)', () => {
  const noAr = (): PlayerPhysics => ({ ...spawnPhysics(0, 5, 0), onGround: false });

  it('despenca bem mais rápido que uma queda normal', () => {
    let livre = noAr();
    let mergulho = noAr();
    for (let i = 0; i < 10; i += 1) {
      livre = stepPlayer(livre, input({}, i), FLOOR);
      mergulho = stepPlayer(mergulho, input({ plunge: true }, i), FLOOR);
    }
    expect(mergulho.vy).toBeLessThan(livre.vy - 10);
    expect(mergulho.y).toBeLessThan(livre.y);
  });

  it('quase não anda de lado enquanto desce', () => {
    const normal = stepPlayer(noAr(), input({ moveX: 1 }), FLOOR);
    const mergulho = stepPlayer(noAr(), input({ moveX: 1, plunge: true }), FLOOR);
    expect(mergulho.vx).toBeCloseTo(normal.vx * 0.25, 6);
  });

  it('no chão não faz nada: o personagem anda como sempre', () => {
    let chao = spawnPhysics(0, 0, 0);
    for (let i = 0; i < 30; i += 1) chao = stepPlayer(chao, input({}, i), FLOOR);
    expect(chao.onGround).toBe(true);
    const andando = stepPlayer(chao, input({ moveX: 1, plunge: true }), FLOOR);
    expect(andando.vx).toBeCloseTo(MOVE_SPEED, 6);
  });

  it('chega ao chão e pousa', () => {
    let p = noAr();
    for (let i = 0; i < 120 && !p.onGround; i += 1)
      p = stepPlayer(p, input({ plunge: true }, i), FLOOR);
    expect(p.onGround).toBe(true);
    expect(p.y).toBeCloseTo(0, 1);
  });
});

describe('altura para mergulhar', () => {
  const caixa = boxFromCenter(5, 1.2, 0, 2, 2.4, 2);
  const mundo: readonly Box[] = [...FLOOR, caixa];

  it('mede até o chão logo abaixo, inclusive em cima de uma caixa', () => {
    expect(alturaAcimaDoChao(0, 1, 0, mundo)).toBeCloseTo(1, 6);
    expect(alturaAcimaDoChao(5, 3, 0, mundo)).toBeCloseTo(0.6, 6);
  });

  it('o pulo comum não chega à altura do mergulho', () => {
    const apice = (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY);
    expect(apice).toBeLessThan(PLUNGE_MIN_HEIGHT);
  });

  it('pular do alto de uma caixa chega', () => {
    // Saiu da caixa de 2,4 m e já está sobre o chão.
    expect(alturaAcimaDoChao(3, 2.4, 0, mundo)).toBeGreaterThanOrEqual(PLUNGE_MIN_HEIGHT);
  });
});
