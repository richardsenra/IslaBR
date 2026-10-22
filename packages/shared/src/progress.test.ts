import { describe, expect, it } from 'vitest';
import { getChest, getQuest } from '@islabr/content';
import {
  MAX_HEARTS_ISLAND,
  STARTING_PROGRESS,
  addItem,
  applyReward,
  itemCount,
  openChest,
  type PlayerProgress,
} from './progress.js';

const semRequisito = (): boolean => true;

describe('recompensa de missão', () => {
  it('a m01 paga 10 moedas e o graveto', () => {
    const { progress, ganhos } = applyReward(STARTING_PROGRESS, getQuest('m01').recompensa);
    expect(progress.moedas).toBe(10);
    expect(itemCount(progress, 'graveto_reforcado')).toBe(1);
    expect(ganhos).toMatchObject({ moedas: 10, itens: ['graveto_reforcado'] });
  });

  it('item repetido na recompensa vira quantidade', () => {
    const { progress } = applyReward(STARTING_PROGRESS, getQuest('m03').recompensa);
    expect(itemCount(progress, 'pocao_pequena')).toBe(2);
  });

  it('soma em cima do que o jogador já tinha', () => {
    const antes = addItem({ ...STARTING_PROGRESS, moedas: 5 }, 'pocao_pequena', 1);
    const { progress } = applyReward(antes, getQuest('m03').recompensa);
    expect(progress.moedas).toBe(5);
    expect(itemCount(progress, 'pocao_pequena')).toBe(3);
  });

  it('a m06 dá o quarto coração e cura junto (SPEC §5)', () => {
    const { progress, ganhos } = applyReward(STARTING_PROGRESS, getQuest('m06').recompensa);
    expect(progress.coracoesMax).toBe(4);
    expect(progress.coracoes).toBe(4);
    expect(ganhos.coracoes).toBe(1);
  });

  it('coração não passa do teto da ilha', () => {
    const cheio: PlayerProgress = {
      ...STARTING_PROGRESS,
      coracoes: MAX_HEARTS_ISLAND,
      coracoesMax: MAX_HEARTS_ISLAND,
    };
    const { progress, ganhos } = applyReward(cheio, getQuest('m06').recompensa);
    expect(progress.coracoesMax).toBe(MAX_HEARTS_ISLAND);
    expect(ganhos.coracoes).toBe(0);
  });

  it('a m13 paga 3 joias', () => {
    const { progress } = applyReward(STARTING_PROGRESS, getQuest('m13').recompensa);
    expect(progress.joias).toBe(3);
    expect(itemCount(progress, 'amuleto_mare')).toBe(1);
  });

  it('não muda o estado antigo', () => {
    const antes = STARTING_PROGRESS;
    applyReward(antes, getQuest('m01').recompensa);
    expect(antes.moedas).toBe(0);
    expect(antes.itens).toEqual({});
  });
});

describe('abrir baú', () => {
  it('o c01 dá 20 moedas', () => {
    const { progress, ganhos, aberto } = openChest(
      STARTING_PROGRESS,
      getChest('c01'),
      semRequisito,
    );
    expect(aberto).toBe(true);
    expect(progress.moedas).toBe(20);
    expect(ganhos.moedas).toBe(20);
    expect(progress.bausAbertos).toEqual(['c01']);
  });

  it('o mesmo jogador não abre duas vezes (SPEC §4)', () => {
    const primeira = openChest(STARTING_PROGRESS, getChest('c01'), semRequisito);
    const segunda = openChest(primeira.progress, getChest('c01'), semRequisito);
    expect(segunda.aberto).toBe(false);
    expect(segunda.recusa).toBe('ja-aberto');
    expect(segunda.progress.moedas).toBe(20);
  });

  it('baú trancado recusa sem a chave', () => {
    const semChave = openChest(STARTING_PROGRESS, getChest('c06'), () => false);
    expect(semChave.aberto).toBe(false);
    expect(semChave.recusa).toBe('falta-requisito');

    const comChave = openChest(STARTING_PROGRESS, getChest('c06'), (r) => r === 'chave_iracema');
    expect(comChave.aberto).toBe(true);
    expect(itemCount(comChave.progress, 'pocao_heroica')).toBe(1);
  });

  it('o c05 exige chave e repelente juntos', () => {
    const soChave = openChest(STARTING_PROGRESS, getChest('c05'), (r) => r === 'chave_ilhota');
    expect(soChave.aberto).toBe(false);

    const tudo = openChest(STARTING_PROGRESS, getChest('c05'), (r) =>
      ['chave_ilhota', 'repelente'].includes(r),
    );
    expect(tudo.aberto).toBe(true);
    expect(itemCount(tudo.progress, 'arma_nv2')).toBe(1);
  });

  it('o c03 entrega a insígnia b01 uma vez só', () => {
    const primeira = openChest(STARTING_PROGRESS, getChest('c03'), semRequisito);
    expect(primeira.progress.insignias).toEqual(['b01']);
    expect(primeira.ganhos.insignias).toEqual(['b01']);

    // Mesmo que outra fonte dê a mesma insígnia, ela não duplica.
    const denovo = applyReward(primeira.progress, getChest('c03').conteudo);
    expect(denovo.progress.insignias).toEqual(['b01']);
    expect(denovo.ganhos.insignias).toEqual([]);
  });

  it('dois jogadores abrem o mesmo baú, cada um recebe (SPEC §4)', () => {
    const a = openChest(STARTING_PROGRESS, getChest('c01'), semRequisito);
    const b = openChest(STARTING_PROGRESS, getChest('c01'), semRequisito);
    expect(a.progress.moedas).toBe(20);
    expect(b.progress.moedas).toBe(20);
  });
});
