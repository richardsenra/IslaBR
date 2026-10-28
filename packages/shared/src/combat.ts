/**
 * Regras de combate (SPEC §6).
 *
 * Tudo aqui é puro: o servidor é quem decide dano e morte (SPEC §4), e o
 * cliente usa as mesmas funções só para prever a animação e o feedback.
 *
 * Vida de inimigo é contada em golpes do Graveto Reforçado (1 por golpe) e
 * dano no jogador é contado em corações, de meio em meio (SPEC §5).
 */

import type { AttackState } from './character.js';
import type { Box } from './collision.js';

/** Segurar o ataque por este tempo vira golpe carregado (SPEC §6). */
export const CHARGE_SECONDS = 0.6;

/** Quanto tempo depois de um golpe ainda emenda o seguinte. */
export const COMBO_WINDOW_SECONDS = 0.7;

/**
 * Tempos de cada golpe, em segundos.
 *
 * `duracao` é quanto o golpe ocupa o personagem. `impacto` é o instante, depois
 * de apertar, em que a lâmina acerta: é aí que o dano sai, e não no clique,
 * para o número aparecer quando a espada chega e não antes de o braço descer.
 *
 * O combo é diagonal, horizontal e um golpe de cima, que fecha mais lento e
 * pesado. O carregado é uma rajada de cortes encadeados, e o impacto cai no
 * último deles.
 */
export const GOLPE_TEMPOS: Readonly<Record<AttackKind, { duracao: number; impacto: number }>> = {
  attack1: { duracao: 0.55, impacto: 0.3 },
  attack2: { duracao: 0.5, impacto: 0.2 },
  attack3: { duracao: 0.75, impacto: 0.45 },
  charged: { duracao: 1.3, impacto: 0.85 },
  // O mergulho bate no instante em que pisa no chão; a duração é a recuperação.
  plunge: { duracao: 0.45, impacto: 0 },
};

/** Congelamento na hora do acerto, em ms (SPEC §6). */
export const HIT_STOP_MS = 60;

/** Alcance do golpe, mais perto do corpo para nunca errar inimigo colado. */
export const ATTACK_REACH = 0.95;
/** Raio da esfera de acerto mais generoso (estilo hack-and-slash / Genshin). */
export const ATTACK_RADIUS = 1.85;

/** No ataque carregado, o golpe pega numa área grande ao redor do jogador. */
export const CHARGED_REACH = 0.35;
export const CHARGED_RADIUS = 2.8;
/** Distância (em metros) que o ataque carregado joga o inimigo para trás. */
export const CHARGED_KNOCKBACK = 4.5;

/** Dano do golpe carregado, em múltiplos do golpe normal (proposta). */
export const CHARGED_MULTIPLIER = 2;

/** Ataque no ar (mergulho): desce com a espada e bate em área ao pousar. */
export const PLUNGE_MULTIPLIER = 1.5;
export const PLUNGE_REACH = 0;
export const PLUNGE_RADIUS = 2.2;
/** Empurrão do mergulho, menor que o do carregado. */
export const PLUNGE_KNOCKBACK = 1.5;
/**
 * Quanto tempo o servidor aceita um mergulho depois de ver o jogador alto o
 * bastante para mergulhar. Sem isto qualquer cliente mandaria o golpe de dano
 * maior de pé, ou num pulo comum.
 */
export const MERGULHO_VALIDO_MS = 1500;

export type AttackKind = AttackState;

/** Quanto cada arma tira por golpe (SPEC §6 e §7.7). */
export const WEAPON_DAMAGE: Readonly<Record<string, number>> = {
  graveto_reforcado: 1,
  arma_nv2: 2,
};

/**
 * A melhor arma que o jogador tem, ou `null`. Servidor e cliente usam esta
 * mesma regra: um decide o dano, o outro decide o que aparece na mão do boneco.
 */
export function melhorArma(itens: Readonly<Record<string, number>>): string | null {
  let melhor: string | null = null;
  let melhorDano = 0;
  for (const [id, dano] of Object.entries(WEAPON_DAMAGE)) {
    if ((itens[id] ?? 0) > 0 && dano > melhorDano) {
      melhor = id;
      melhorDano = dano;
    }
  }
  return melhor;
}

/**
 * Arma na mão: a que o jogador escolheu, se ainda a tem; senão, a melhor. Se a
 * escolhida sair do inventário, volta sozinho para a melhor.
 */
export function armaEmUso(
  itens: Readonly<Record<string, number>>,
  equipada: string | null,
): string | null {
  if (equipada !== null && ehArma(equipada) && (itens[equipada] ?? 0) > 0) return equipada;
  return melhorArma(itens);
}

export function ehArma(itemId: string): boolean {
  return Object.hasOwn(WEAPON_DAMAGE, itemId);
}

export function danoDaArma(arma: string | null): number {
  if (!arma) return 0;
  return WEAPON_DAMAGE[arma] ?? 0;
}

/** Dano de um golpe, já contando o carregado. */
export function danoDoGolpe(arma: string | null, golpe: AttackKind): number {
  const base = danoDaArma(arma);
  if (golpe === 'charged') return base * CHARGED_MULTIPLIER;
  // Arredonda para cima: com o graveto (1) o mergulho tira 2, como o carregado.
  if (golpe === 'plunge') return Math.ceil(base * PLUNGE_MULTIPLIER);
  return base;
}

/** Onde e quão grande é a esfera de acerto de cada golpe. */
export function areaDoGolpe(golpe: AttackKind): { alcance: number; raio: number } {
  if (golpe === 'charged') return { alcance: CHARGED_REACH, raio: CHARGED_RADIUS };
  if (golpe === 'plunge') return { alcance: PLUNGE_REACH, raio: PLUNGE_RADIUS };
  return { alcance: ATTACK_REACH, raio: ATTACK_RADIUS };
}

/** Quanto o golpe joga para longe quem sobrevive a ele, em metros. */
export function empurraoDoGolpe(golpe: AttackKind): number {
  if (golpe === 'charged') return CHARGED_KNOCKBACK;
  if (golpe === 'plunge') return PLUNGE_KNOCKBACK;
  return 0;
}

/**
 * Próximo golpe do combo de 3 (SPEC §6). Emendar dentro da janela avança;
 * esperar demais recomeça do primeiro.
 */
export function proximoGolpe(anterior: AttackKind | null, desdeOUltimo: number): AttackKind {
  if (!anterior || desdeOUltimo > COMBO_WINDOW_SECONDS) return 'attack1';
  if (anterior === 'attack1') return 'attack2';
  if (anterior === 'attack2') return 'attack3';
  // Depois do terceiro, o combo reinicia.
  return 'attack1';
}

export function duracaoDoGolpe(golpe: AttackKind): number {
  return GOLPE_TEMPOS[golpe].duracao;
}

/** Segundos entre apertar e a lâmina acertar. */
export function impactoDoGolpe(golpe: AttackKind): number {
  return GOLPE_TEMPOS[golpe].impacto;
}

/**
 * Fração da duração do golpe depois da qual já dá para atacar de novo. Menor
 * que 1 porque emendar o combo tem que ser possível antes de a animação acabar.
 * Cliente e servidor usam esta mesma conta: o cliente não manda golpe que o
 * servidor ia recusar, e o servidor não deixa passar golpe mais rápido.
 */
export const ATTACK_COOLDOWN_FACTOR = 0.72;

/** Quanto esperar, em ms, até o próximo golpe depois deste. */
export function recargaDoGolpeMs(golpe: AttackKind): number {
  return duracaoDoGolpe(golpe) * 1000 * ATTACK_COOLDOWN_FACTOR;
}

/**
 * Menor intervalo, em ms, entre o golpe anterior chegar ao servidor e o próximo.
 *
 * O servidor só vê o momento do impacto (o cliente manda o golpe aí), então a
 * regra "o próximo começa depois da recarga" vira, em tempo de chegada,
 * `recarga(anterior) - impacto(anterior) + impacto(próximo)`. É exatamente o
 * mínimo de quem joga direito: um cliente adulterado não bate mais rápido, e
 * um honesto nunca é recusado (fora a folga de rede, que é do chamador).
 */
export function intervaloMinimoMs(anterior: AttackKind | null, proximo: AttackKind): number {
  if (!anterior) return 0;
  const entreImpactos =
    recargaDoGolpeMs(anterior) - impactoDoGolpe(anterior) * 1000 + impactoDoGolpe(proximo) * 1000;

  // O servidor não enxerga o botão sendo segurado, só o golpe saindo. Um
  // carregado honesto exige segurar CHARGE_SECONDS (a contar do fim do golpe
  // anterior, porque dá para começar a segurar durante ele); sem este piso,
  // um cliente adulterado mandaria "carregado" em rajada.
  if (proximo === 'charged') {
    const segurando =
      CHARGE_SECONDS * 1000 + impactoDoGolpe('charged') * 1000 - impactoDoGolpe(anterior) * 1000;
    return Math.max(entreImpactos, segurando);
  }
  return Math.max(entreImpactos, 0);
}

export interface Ponto {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Centro da esfera de acerto: à frente do jogador, na altura do peito.
 * As esferas presas aos ossos da SPEC §6 chegam com a arte; esta é a
 * aproximação que o servidor consegue validar sem simular o esqueleto.
 */
export function centroDoGolpe(origem: Ponto, yaw: number, alcance = ATTACK_REACH): Ponto {
  return {
    x: origem.x + Math.sin(yaw) * alcance,
    y: origem.y + 0.9,
    z: origem.z + Math.cos(yaw) * alcance,
  };
}

/**
 * Faixa vertical do golpe, em metros acima e abaixo do centro. O raio generoso
 * vale só no plano do chão; na altura a conta é honesta, para o mosquito que
 * orbita no alto (SPEC §7.6) continuar fora do alcance de quem está no chão.
 */
export const ALCANCE_VERTICAL = 1.4;

export function dentroDaEsfera(centro: Ponto, alvo: Ponto, raio: number): boolean {
  const dx = alvo.x - centro.x;
  const dy = alvo.y + 0.5 - centro.y;
  const dz = alvo.z - centro.z;
  if (Math.abs(dy) > ALCANCE_VERTICAL) return false;
  return dx * dx + dz * dz <= raio * raio;
}

export interface AlvoDeGolpe extends Ponto {
  readonly id: string;
}

/** Quem o golpe pegou, do mais perto para o mais longe. */
export function alvosAtingidos(
  origem: Ponto,
  yaw: number,
  alvos: readonly AlvoDeGolpe[],
  alcance = ATTACK_REACH,
  raio = ATTACK_RADIUS,
): AlvoDeGolpe[] {
  const centro = centroDoGolpe(origem, yaw, alcance);
  return alvos
    .filter((alvo) => dentroDaEsfera(centro, alvo, raio))
    .sort(
      (a, b) =>
        (a.x - centro.x) ** 2 +
        (a.z - centro.z) ** 2 -
        ((b.x - centro.x) ** 2 + (b.z - centro.z) ** 2),
    );
}

/** Folga entre o centro do inimigo e a parede em que o empurrão para. */
const FOLGA_DA_PAREDE = 0.5;
const PASSOS_DO_EMPURRAO = 6;

/**
 * Para onde o golpe carregado joga o alvo: em linha reta, para longe do
 * atacante, andando em passos para não atravessar as paredes da arena. Se o
 * alvo está colado no atacante, vai para onde o golpe aponta.
 */
export function empurrar(
  atacante: Ponto,
  yaw: number,
  alvo: Ponto,
  colisores: readonly Box[],
  forca = CHARGED_KNOCKBACK,
): { x: number; z: number } {
  const dx = alvo.x - atacante.x;
  const dz = alvo.z - atacante.z;
  const dist = Math.hypot(dx, dz);
  const dirX = dist > 0.05 ? dx / dist : Math.sin(yaw);
  const dirZ = dist > 0.05 ? dz / dist : Math.cos(yaw);

  const passo = forca / PASSOS_DO_EMPURRAO;
  let x = alvo.x;
  let z = alvo.z;
  for (let i = 0; i < PASSOS_DO_EMPURRAO; i += 1) {
    const candX = x + dirX * passo;
    const candZ = z + dirZ * passo;
    const bateu = colisores.some(
      (c) =>
        candX >= c.minX - FOLGA_DA_PAREDE &&
        candX <= c.maxX + FOLGA_DA_PAREDE &&
        candZ >= c.minZ - FOLGA_DA_PAREDE &&
        candZ <= c.maxZ + FOLGA_DA_PAREDE &&
        alvo.y < c.maxY,
    );
    if (bateu) break;
    x = candX;
    z = candZ;
  }
  return { x, z };
}

/** O golpe veio de frente para o inimigo? Usado pelo caranguejo espinhoso. */
export function golpeDeFrente(
  atacante: Ponto,
  alvo: Ponto,
  yawDoAlvo: number,
  tolerancia = Math.PI / 2,
): boolean {
  const paraOAtacante = Math.atan2(atacante.x - alvo.x, atacante.z - alvo.z);
  const diferenca = Math.abs(
    Math.atan2(Math.sin(paraOAtacante - yawDoAlvo), Math.cos(paraOAtacante - yawDoAlvo)),
  );
  return diferenca <= tolerancia;
}

export interface ResultadoDoGolpe {
  /** Dano aplicado no inimigo. */
  readonly dano: number;
  /** Dano que voltou no jogador, em corações (caranguejo espinhoso). */
  readonly refletido: number;
}

/**
 * Dano de um golpe num inimigo. O espinhoso (e02) devolve o golpe de frente;
 * pelas costas, leva normal (SPEC §7.6).
 */
export function resolverGolpe(opcoes: {
  readonly arma: string | null;
  readonly golpe: AttackKind;
  readonly refleteDeFrente: boolean;
  readonly deFrente: boolean;
  readonly danoDoInimigo: number;
}): ResultadoDoGolpe {
  if (opcoes.refleteDeFrente && opcoes.deFrente) {
    return { dano: 0, refletido: opcoes.danoDoInimigo };
  }
  return { dano: danoDoGolpe(opcoes.arma, opcoes.golpe), refletido: 0 };
}

/**
 * Dano que chega no jogador, em corações. A esquiva dá invulnerabilidade curta
 * e a armadura apara meio coração (SPEC §6 e §7.7).
 */
export function danoNoJogador(opcoes: {
  readonly dano: number;
  readonly invulneravel: boolean;
  readonly reducao: number;
}): number {
  if (opcoes.invulneravel) return 0;
  const depoisDaArmadura = opcoes.dano - opcoes.reducao;
  // Nunca cura, e nunca passa de meio coração de granularidade.
  return Math.max(0, Math.round(depoisDaArmadura * 2) / 2);
}

export function aplicarDano(vidaAtual: number, dano: number): number {
  return Math.max(0, vidaAtual - dano);
}
