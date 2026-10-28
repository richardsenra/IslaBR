import { getEnemy, type Ia } from '@islabr/content';
import {
  andarPara,
  distancia,
  virarPara,
  type Acao,
  type AlvoDoInimigo,
  type EnemyRuntime,
} from './enemyAI.js';

/**
 * IA dos mini-chefes (SPEC §7.6). Os dois usam o mesmo truque: um círculo
 * vermelho no chão avisa onde o golpe vai cair, e só quem ainda estiver dentro
 * quando o tempo acaba leva o dano. Quem se mexe a tempo escapa.
 *
 * - Caranguejo-Rei (mb1): persegue e belisca; investe sobre onde o jogador
 *   estava; abaixo da metade da vida passa a chover bolhas ao redor dele.
 * - Sapo-Ancestral (mb2): pula em área sobre o jogador e chama mosquitos.
 *
 * Os números vêm do JSON. Os avisos e os pedidos de invocação saem pelos campos
 * `avisos` e `invocar` do inimigo, que a sala esvazia a cada tick.
 */

type Rei = Extract<Ia, { tipo: 'rei' }>;
type Ancestral = Extract<Ia, { tipo: 'ancestral' }>;

/** Velocidade da investida do Caranguejo-Rei, em m/s. */
const VELOCIDADE_DA_INVESTIDA = 11;
/** Duração do salto do Sapo-Ancestral, em segundos. */
const DURACAO_DO_SALTO = 0.55;
/** Giro máximo, em rad/s. */
const GIRO = 5;

interface Circulo {
  readonly x: number;
  readonly z: number;
  readonly raio: number;
}

function quemEstaDentro(
  jogadores: readonly AlvoDoInimigo[],
  circulos: readonly Circulo[],
): string[] {
  return jogadores
    .filter(
      (jogador) =>
        jogador.atacavel &&
        circulos.some((c) => Math.hypot(jogador.x - c.x, jogador.z - c.z) <= c.raio),
    )
    .map((jogador) => jogador.sessionId);
}

function golpeEmArea(
  inimigo: EnemyRuntime,
  jogadores: readonly AlvoDoInimigo[],
  circulos: readonly Circulo[],
): Acao | null {
  const alvos = quemEstaDentro(jogadores, circulos);
  if (alvos.length === 0) return null;
  return { tipo: 'choque', inimigo: inimigo.id, alvos, dano: getEnemy(inimigo.tipo).dano };
}

function avisar(inimigo: EnemyRuntime, circulo: Circulo, segundos: number): void {
  inimigo.avisos.push({ x: circulo.x, z: circulo.z, raio: circulo.raio, segundos });
}

export function passoDoRei(
  inimigo: EnemyRuntime,
  ia: Rei,
  alvo: AlvoDoInimigo,
  jogadores: readonly AlvoDoInimigo[],
  perto: number,
  dt: number,
): Acao | null {
  const def = getEnemy(inimigo.tipo);
  const segundaFase = inimigo.hp <= def.hp / 2;

  switch (inimigo.estado) {
    case 'preparando': {
      // Parado olhando o círculo: é o aviso da investida.
      inimigo.tempo -= dt;
      if (inimigo.tempo > 0) return null;
      inimigo.estado = 'investindo';
      return null;
    }
    case 'investindo': {
      const destino = { x: inimigo.paraX, z: inimigo.paraZ };
      virarPara(inimigo, destino, GIRO * 3 * dt);
      andarPara(inimigo, destino, VELOCIDADE_DA_INVESTIDA, dt);
      if (distancia(inimigo, destino) > 0.2) return null;
      inimigo.estado = 'perseguindo';
      inimigo.recarga = ia.recarga;
      return golpeEmArea(inimigo, jogadores, [{ ...destino, raio: ia.raio_investida }]);
    }
    case 'bolhas': {
      inimigo.tempo -= dt;
      if (inimigo.tempo > 0) return null;
      inimigo.estado = 'perseguindo';
      inimigo.recargaCuspe = ia.recarga_bolhas;
      return golpeEmArea(inimigo, jogadores, inimigo.circulos);
    }
    default:
      break;
  }

  virarPara(inimigo, alvo, GIRO * dt);

  // Segunda fase: chove bolha ao redor do jogador, de tempos em tempos.
  if (segundaFase && inimigo.recargaCuspe <= 0 && perto <= ia.aggro) {
    inimigo.circulos = [{ x: alvo.x, z: alvo.z, raio: ia.raio_bolha }];
    for (let i = 1; i < ia.bolhas; i += 1) {
      const angulo = Math.random() * Math.PI * 2;
      const distanciaDoAlvo = 1.5 + Math.random() * 4;
      inimigo.circulos.push({
        x: alvo.x + Math.cos(angulo) * distanciaDoAlvo,
        z: alvo.z + Math.sin(angulo) * distanciaDoAlvo,
        raio: ia.raio_bolha,
      });
    }
    for (const circulo of inimigo.circulos) avisar(inimigo, circulo, ia.aviso_bolha);
    inimigo.estado = 'bolhas';
    inimigo.tempo = ia.aviso_bolha;
    return null;
  }

  // Longe do alcance de belisco: ou investe (se já pode), ou se aproxima.
  if (perto > ia.alcance) {
    if (inimigo.recarga <= 0 && perto <= ia.aggro) {
      inimigo.paraX = alvo.x;
      inimigo.paraZ = alvo.z;
      avisar(inimigo, { x: alvo.x, z: alvo.z, raio: ia.raio_investida }, ia.aviso_investida);
      inimigo.estado = 'preparando';
      inimigo.tempo = ia.aviso_investida;
      return null;
    }
    inimigo.estado = 'perseguindo';
    andarPara(inimigo, alvo, ia.velocidade, dt);
    return null;
  }

  inimigo.estado = 'atacando';
  if (inimigo.recarga > 0) return null;
  inimigo.recarga = ia.recarga;
  return { tipo: 'mordida', inimigo: inimigo.id, alvo: alvo.sessionId, dano: def.dano };
}

export function passoDoAncestral(
  inimigo: EnemyRuntime,
  ia: Ancestral,
  alvo: AlvoDoInimigo,
  jogadores: readonly AlvoDoInimigo[],
  perto: number,
  dt: number,
): Acao | null {
  const def = getEnemy(inimigo.tipo);

  switch (inimigo.estado) {
    case 'preparando': {
      inimigo.tempo -= dt;
      if (inimigo.tempo > 0) return null;
      inimigo.estado = 'pulando';
      inimigo.deX = inimigo.x;
      inimigo.deZ = inimigo.z;
      inimigo.tempo = DURACAO_DO_SALTO;
      return null;
    }
    case 'pulando': {
      inimigo.tempo -= dt;
      const t = 1 - Math.max(inimigo.tempo, 0) / DURACAO_DO_SALTO;
      inimigo.x = inimigo.deX + (inimigo.paraX - inimigo.deX) * t;
      inimigo.z = inimigo.deZ + (inimigo.paraZ - inimigo.deZ) * t;
      inimigo.y = Math.sin(t * Math.PI) * 2.2;
      if (inimigo.tempo > 0) return null;
      inimigo.x = inimigo.paraX;
      inimigo.z = inimigo.paraZ;
      inimigo.y = 0;
      inimigo.estado = 'perseguindo';
      inimigo.recarga = ia.recarga;
      return golpeEmArea(inimigo, jogadores, [
        { x: inimigo.paraX, z: inimigo.paraZ, raio: ia.raio_pulo },
      ]);
    }
    default:
      break;
  }

  virarPara(inimigo, alvo, GIRO * dt);

  // Chama mosquitos de tempos em tempos; a sala limita quantos existem.
  if (inimigo.recargaCuspe <= 0) {
    inimigo.invocar = ia.invoca;
    inimigo.maxInvocados = ia.invoca_max;
    inimigo.recargaCuspe = ia.recarga_invocacao;
  }

  if (perto > ia.alcance) {
    if (inimigo.recarga <= 0 && perto <= ia.aggro) {
      inimigo.paraX = alvo.x;
      inimigo.paraZ = alvo.z;
      avisar(inimigo, { x: alvo.x, z: alvo.z, raio: ia.raio_pulo }, ia.aviso_pulo);
      inimigo.estado = 'preparando';
      inimigo.tempo = ia.aviso_pulo;
      return null;
    }
    inimigo.estado = 'perseguindo';
    andarPara(inimigo, alvo, ia.velocidade, dt);
    return null;
  }

  inimigo.estado = 'atacando';
  if (inimigo.recarga > 0) return null;
  inimigo.recarga = ia.recarga;
  return { tipo: 'mordida', inimigo: inimigo.id, alvo: alvo.sessionId, dano: def.dano };
}
