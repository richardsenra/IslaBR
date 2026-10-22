import { describe, expect, it } from 'vitest';
import { isCharacterState, nextCharacterState, type CharacterContext } from './character.js';

function ctx(partial: Partial<CharacterContext> = {}): CharacterContext {
  return {
    dead: false,
    hurt: false,
    attack: null,
    dodging: false,
    onGround: true,
    vy: 0,
    speed: 0,
    ...partial,
  };
}

describe('máquina de estados do personagem', () => {
  it('parado no chão fica idle', () => {
    expect(nextCharacterState(ctx())).toBe('idle');
  });

  it('andando fica run', () => {
    expect(nextCharacterState(ctx({ speed: 5 }))).toBe('run');
  });

  it('no ar separa subida de queda', () => {
    expect(nextCharacterState(ctx({ onGround: false, vy: 3 }))).toBe('jump');
    expect(nextCharacterState(ctx({ onGround: false, vy: -3 }))).toBe('fall');
  });

  it('morte vence tudo', () => {
    expect(
      nextCharacterState(ctx({ dead: true, hurt: true, dodging: true, attack: 'attack1' })),
    ).toBe('dead');
  });

  it('dano vence esquiva e ataque', () => {
    expect(nextCharacterState(ctx({ hurt: true, dodging: true, attack: 'charged' }))).toBe('hurt');
  });

  it('esquiva vence ataque e pulo', () => {
    expect(
      nextCharacterState(ctx({ dodging: true, attack: 'attack2', onGround: false, vy: 5 })),
    ).toBe('dodge');
  });

  it('ataque vence corrida', () => {
    expect(nextCharacterState(ctx({ attack: 'attack3', speed: 5 }))).toBe('attack3');
  });

  it('reconhece nomes de estado vindos da rede', () => {
    expect(isCharacterState('dodge')).toBe(true);
    expect(isCharacterState('voando')).toBe(false);
  });
});
