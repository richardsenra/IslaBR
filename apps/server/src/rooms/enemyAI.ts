import { getEnemy, type Ia } from '@islabr/content';
import { wrapAngle } from '@islabr/shared';

/**
 * IA dos inimigos comuns (SPEC §7.6 e §9, M3). Roda no tick de 20 Hz do
 * servidor, uma máquina de estados por arquétipo:
 *
 * - perseguidor: anda atrás do jogador e belisca (caranguejos)
 * - voador: voa em círculos e mergulha, só vulnerável na descida (mosquito)
 * - saltador: pula até o jogador e cospe gosma que deixa lento (sapo)
 * - flutuante: flutua, carrega e dá choque em área (água-viva)
 *
 * Os números de cada bicho vêm do JSON (`ia` em enemies.json); aqui está só o
 * comportamento. Todo ataque tem aviso antes (parar, inflar, brilhar): quem
 * toma dano sem ter visto o golpe vir não aprende nada.
 */

/** Distância, em múltiplos do `aggro`, em que o bicho desiste da perseguição. */
const DESIST_FATOR = 1.7;
/** Tempo parado depois de levar um golpe. */
export const FLINCH_SECONDS = 0.25;
/** Giro máximo do bicho, em rad/s. */
const GIRO = 6;
/** Fração da recarga que o mosquito gasta circulando antes de mergulhar. */
const VOLTAS_ANTES_DO_MERGULHO = 0.7;

export type EnemyMode =
  | 'parado'
  | 'perseguindo'
  | 'atacando'
  | 'ferido'
  | 'morto'
  // voador
  | 'orbitando'
  | 'preparando'
  | 'mergulhando'
  | 'recuando'
  // saltador
  | 'pulando'
  | 'cuspindo'
  // flutuante
  | 'flutuando'
  | 'carregando';

export interface EnemyRuntime {
  readonly id: string;
  readonly tipo: string;
  readonly ia: Ia | undefined;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  estado: EnemyMode;
  /** Onde ele fica quando não tem ninguém por perto. */
  readonly postoX: number;
  readonly postoZ: number;
  /** Tempo até poder atacar de novo. */
  recarga: number;
  /** Tempo até poder cuspir de novo (saltador). */
  recargaCuspe: number;
  /** Tempo restante de tontura depois de apanhar. */
  atordoado: number;
  /** Quanto falta para o estado atual acabar (aviso, pulo, carga…). */
  tempo: number;
  /** Quem ele está perseguindo. */
  alvo: string | null;
  /** Ângulo da órbita do voador; também faz a água-viva balançar. */
  fase: number;
  /** Ponto de partida e de chegada do pulo ou do mergulho. */
  deX: number;
  deZ: number;
  paraX: number;
  paraZ: number;
}

export interface AlvoDoInimigo {
  readonly sessionId: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Jogador caído não vira alvo. */
  readonly atacavel: boolean;
}

/** O que o bicho fez neste passo e precisa chegar até os jogadores. */
export type Acao =
  | {
      readonly tipo: 'mordida';
      readonly inimigo: string;
      readonly alvo: string;
      readonly dano: number;
    }
  | {
      readonly tipo: 'gosma';
      readonly inimigo: string;
      readonly alvo: string;
      readonly segundos: number;
    }
  | {
      readonly tipo: 'choque';
      readonly inimigo: string;
      readonly alvos: readonly string[];
      readonly dano: number;
    };

export function criarInimigo(
  id: string,
  tipo: string,
  x: number,
  z: number,
  yaw = 0,
): EnemyRuntime {
  const def = getEnemy(tipo);
  const ia = def.ia;
  const altura = ia?.tipo === 'voador' || ia?.tipo === 'flutuante' ? ia.altura : 0;
  return {
    id,
    tipo,
    ia,
    x,
    y: altura,
    z,
    yaw,
    hp: def.hp,
    // Sem alvo, todo bicho começa parado (o mosquito paira, a água-viva boia).
    // `orbitando` só existe com alguém para orbitar: o cliente usa o estado para
    // saber quem já percebeu o jogador.
    estado: ia?.tipo === 'flutuante' ? 'flutuando' : 'parado',
    postoX: x,
    postoZ: z,
    // O mosquito circula um tempo antes do primeiro mergulho; sem isso ele
    // atacaria no instante em que percebe o jogador, sem "voar em círculos".
    recarga: ia?.tipo === 'voador' ? ia.recarga * VOLTAS_ANTES_DO_MERGULHO : 0,
    recargaCuspe: 0,
    atordoado: 0,
    tempo: 0,
    alvo: null,
    fase: Math.random() * Math.PI * 2,
    deX: x,
    deZ: z,
    paraX: x,
    paraZ: z,
  };
}

function distancia(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Vira na direção do ponto, sem girar mais que `maxGiro` no passo. */
function virarPara(inimigo: EnemyRuntime, alvo: { x: number; z: number }, maxGiro: number): void {
  const desejado = Math.atan2(alvo.x - inimigo.x, alvo.z - inimigo.z);
  const diferenca = wrapAngle(desejado - inimigo.yaw);
  inimigo.yaw = wrapAngle(
    inimigo.yaw + Math.sign(diferenca) * Math.min(Math.abs(diferenca), maxGiro),
  );
}

function andarPara(
  inimigo: EnemyRuntime,
  alvo: { x: number; z: number },
  velocidade: number,
  dt: number,
): void {
  const dx = alvo.x - inimigo.x;
  const dz = alvo.z - inimigo.z;
  const falta = Math.hypot(dx, dz);
  if (falta < 0.02) return;
  const passo = Math.min(velocidade * dt, falta);
  inimigo.x += (dx / falta) * passo;
  inimigo.z += (dz / falta) * passo;
}

/** Aproxima `y` do alvo sem passar dele. */
function subirPara(inimigo: EnemyRuntime, alvoY: number, velocidade: number, dt: number): void {
  const falta = alvoY - inimigo.y;
  inimigo.y += Math.sign(falta) * Math.min(Math.abs(falta), velocidade * dt);
}

function alturaDeRepouso(ia: Ia): number {
  return ia.tipo === 'voador' || ia.tipo === 'flutuante' ? ia.altura : 0;
}

/**
 * Um passo da IA de um inimigo. Devolve a ação que ele fez, se fez alguma.
 * Só mexe no próprio inimigo, o que deixa o teste simples.
 */
export function passoDaIA(
  inimigo: EnemyRuntime,
  jogadores: readonly AlvoDoInimigo[],
  dt: number,
): Acao | null {
  if (inimigo.estado === 'morto' || !inimigo.ia) return null;
  const ia = inimigo.ia;

  inimigo.recarga = Math.max(0, inimigo.recarga - dt);
  inimigo.recargaCuspe = Math.max(0, inimigo.recargaCuspe - dt);
  inimigo.atordoado = Math.max(0, inimigo.atordoado - dt);

  if (inimigo.atordoado > 0) {
    inimigo.estado = 'ferido';
    inimigo.tempo = 0;
    return null;
  }
  // Saiu da tontura: volta ao comportamento do arquétipo.
  if (inimigo.estado === 'ferido') {
    inimigo.estado =
      ia.tipo === 'voador' ? 'orbitando' : ia.tipo === 'flutuante' ? 'flutuando' : 'parado';
  }

  const alvos = jogadores.filter((jogador) => jogador.atacavel);
  const maisPerto = alvos.reduce<AlvoDoInimigo | null>((melhor, jogador) => {
    if (!melhor) return jogador;
    return distancia(inimigo, jogador) < distancia(inimigo, melhor) ? jogador : melhor;
  }, null);

  const desiste = ia.aggro * DESIST_FATOR;
  // Pulo e mergulho não se interrompem: parar no ar congelaria o bicho lá.
  const emPlena = inimigo.estado === 'pulando' || inimigo.estado === 'mergulhando';

  let referencia = maisPerto;
  if (!referencia && emPlena) {
    // O jogador sumiu no meio do movimento: termina o que começou, até o ponto
    // de chegada, e só então volta ao posto.
    referencia = { sessionId: '', x: inimigo.paraX, y: 0, z: inimigo.paraZ, atacavel: false };
  }

  if (!emPlena && (!referencia || distancia(inimigo, referencia) > desiste)) {
    voltarAoPosto(inimigo, ia, dt);
    return null;
  }
  if (!referencia) return null;

  const perto = distancia(inimigo, referencia);
  // Ainda não percebeu ninguém: só acorda se o jogador entrar no raio dele.
  if (inimigo.alvo === null && perto > ia.aggro && !emPlena) {
    voltarAoPosto(inimigo, ia, dt);
    return null;
  }
  inimigo.alvo = referencia.sessionId === '' ? inimigo.alvo : referencia.sessionId;

  switch (ia.tipo) {
    case 'perseguidor':
      return passoPerseguidor(inimigo, ia, referencia, perto, dt);
    case 'voador':
      return passoVoador(inimigo, ia, referencia, perto, dt);
    case 'saltador':
      return passoSaltador(inimigo, ia, referencia, perto, dt);
    case 'flutuante':
      return passoFlutuante(inimigo, ia, jogadores, referencia, perto, dt);
  }
}

function voltarAoPosto(inimigo: EnemyRuntime, ia: Ia, dt: number): void {
  inimigo.alvo = null;
  inimigo.estado = ia.tipo === 'flutuante' ? 'flutuando' : 'parado';
  inimigo.tempo = 0;
  // Quem perdeu o jogador e o reencontra também circula primeiro.
  if (ia.tipo === 'voador') {
    inimigo.recarga = Math.max(inimigo.recarga, ia.recarga * VOLTAS_ANTES_DO_MERGULHO);
  }
  andarPara(inimigo, { x: inimigo.postoX, z: inimigo.postoZ }, ia.velocidade * 0.6, dt);
  subirPara(inimigo, alturaDeRepouso(ia), 3, dt);
}

type Perseguidor = Extract<Ia, { tipo: 'perseguidor' }>;
type Voador = Extract<Ia, { tipo: 'voador' }>;
type Saltador = Extract<Ia, { tipo: 'saltador' }>;
type Flutuante = Extract<Ia, { tipo: 'flutuante' }>;

function passoPerseguidor(
  inimigo: EnemyRuntime,
  ia: Perseguidor,
  alvo: AlvoDoInimigo,
  perto: number,
  dt: number,
): Acao | null {
  virarPara(inimigo, alvo, GIRO * dt);

  if (perto > ia.alcance) {
    inimigo.estado = 'perseguindo';
    andarPara(inimigo, alvo, ia.velocidade, dt);
    return null;
  }

  inimigo.estado = 'atacando';
  if (inimigo.recarga > 0) return null;

  inimigo.recarga = ia.recarga;
  return { tipo: 'mordida', inimigo: inimigo.id, alvo: alvo.sessionId, dano: danoDe(inimigo) };
}

/**
 * Mosquito: gira em volta do jogador a uma altura que a espada não alcança,
 * avisa, mergulha e volta a subir. É na descida que dá para acertá-lo.
 */
function passoVoador(
  inimigo: EnemyRuntime,
  ia: Voador,
  alvo: AlvoDoInimigo,
  perto: number,
  dt: number,
): Acao | null {
  virarPara(inimigo, alvo, GIRO * dt);

  switch (inimigo.estado) {
    case 'preparando': {
      // Para no ar e treme: é o aviso do mergulho.
      inimigo.tempo -= dt;
      subirPara(inimigo, ia.altura + 0.25, 2, dt);
      if (inimigo.tempo <= 0) {
        inimigo.estado = 'mergulhando';
        inimigo.deX = inimigo.x;
        inimigo.deZ = inimigo.z;
        // Mira onde o jogador está agora; quem se mexer a tempo escapa.
        inimigo.paraX = alvo.x;
        inimigo.paraZ = alvo.z;
      }
      return null;
    }

    case 'mergulhando': {
      const total = Math.max(
        distancia({ x: inimigo.deX, z: inimigo.deZ }, { x: inimigo.paraX, z: inimigo.paraZ }),
        0.01,
      );
      andarPara(inimigo, { x: inimigo.paraX, z: inimigo.paraZ }, ia.velocidade_mergulho, dt);
      const falta = distancia(inimigo, { x: inimigo.paraX, z: inimigo.paraZ });
      // Chega à altura do peito antes de alcançar o jogador: é na descida que
      // a espada o pega, então a descida tem que acabar a tempo de ser golpeada.
      const progresso = 1 - Math.min(falta / total, 1);
      const descida = Math.min(progresso / 0.5, 1);
      inimigo.y = ia.altura + (0.55 - ia.altura) * descida;

      // Acertou o jogador no caminho.
      if (distancia(inimigo, alvo) <= ia.alcance && inimigo.y <= 1.2) {
        inimigo.estado = 'recuando';
        inimigo.tempo = 0.7;
        inimigo.recarga = ia.recarga;
        return {
          tipo: 'mordida',
          inimigo: inimigo.id,
          alvo: alvo.sessionId,
          dano: danoDe(inimigo),
        };
      }
      if (falta < 0.2) {
        // Errou: sobe sem ter mordido, e a recarga também vale.
        inimigo.estado = 'recuando';
        inimigo.tempo = 0.7;
        inimigo.recarga = ia.recarga;
      }
      return null;
    }

    case 'recuando': {
      inimigo.tempo -= dt;
      subirPara(inimigo, ia.altura, 3.5, dt);
      if (inimigo.tempo <= 0) inimigo.estado = 'orbitando';
      return null;
    }

    default: {
      inimigo.estado = 'orbitando';
      // Gira em volta do jogador à altura de voo.
      inimigo.fase += (ia.velocidade / ia.raio_orbita) * dt;
      const ponto = {
        x: alvo.x + Math.cos(inimigo.fase) * ia.raio_orbita,
        z: alvo.z + Math.sin(inimigo.fase) * ia.raio_orbita,
      };
      // Corre um pouco mais que a órbita, senão ele nunca alcança o círculo.
      andarPara(inimigo, ponto, ia.velocidade * 1.6, dt);
      subirPara(inimigo, ia.altura, 3, dt);

      if (inimigo.recarga <= 0 && perto <= ia.aggro) {
        inimigo.estado = 'preparando';
        inimigo.tempo = ia.aviso;
      }
      return null;
    }
  }
}

/** Sapo: pula até o jogador, morde na aterrissagem e cospe gosma de longe. */
function passoSaltador(
  inimigo: EnemyRuntime,
  ia: Saltador,
  alvo: AlvoDoInimigo,
  perto: number,
  dt: number,
): Acao | null {
  const aqui = { x: inimigo.x, z: inimigo.z };

  if (inimigo.estado === 'pulando') {
    inimigo.tempo -= dt;
    const t = 1 - Math.max(inimigo.tempo, 0) / ia.duracao_pulo;
    inimigo.x = inimigo.deX + (inimigo.paraX - inimigo.deX) * t;
    inimigo.z = inimigo.deZ + (inimigo.paraZ - inimigo.deZ) * t;
    // Arco do pulo: sobe e desce, chegando de volta ao chão.
    inimigo.y = 4 * 1.1 * t * (1 - t);

    if (inimigo.tempo > 0) return null;
    inimigo.y = 0;
    inimigo.estado = 'parado';
    inimigo.tempo = 0.35;
    // Aterrissou em cima do jogador: é a mordida do sapo (SPEC §7.6, dano 1).
    if (distancia(aqui, alvo) <= ia.alcance && inimigo.recarga <= 0) {
      inimigo.recarga = ia.recarga;
      return { tipo: 'mordida', inimigo: inimigo.id, alvo: alvo.sessionId, dano: danoDe(inimigo) };
    }
    return null;
  }

  if (inimigo.estado === 'cuspindo') {
    // Para, encara e infla: é o aviso do cuspe.
    virarPara(inimigo, alvo, GIRO * dt);
    inimigo.tempo -= dt;
    if (inimigo.tempo > 0) return null;

    inimigo.estado = 'parado';
    inimigo.tempo = 0.3;
    inimigo.recargaCuspe = ia.recarga_cuspe;
    // Se o jogador já saiu do alcance, a gosma erra.
    if (perto > ia.alcance_cuspe + 1.5) return null;
    return {
      tipo: 'gosma',
      inimigo: inimigo.id,
      alvo: alvo.sessionId,
      segundos: ia.lento_segundos,
    };
  }

  // Descansando entre um pulo e outro.
  virarPara(inimigo, alvo, GIRO * dt);
  inimigo.tempo = Math.max(0, inimigo.tempo - dt);
  inimigo.estado = 'parado';
  if (inimigo.tempo > 0) return null;

  // De longe, cospe; de perto, pula.
  if (perto > 3 && perto <= ia.alcance_cuspe && inimigo.recargaCuspe <= 0) {
    inimigo.estado = 'cuspindo';
    inimigo.tempo = ia.aviso_cuspe;
    return null;
  }

  if (perto > ia.alcance * 0.8) {
    // Pula em direção ao jogador, parando antes de cair em cima dele.
    const dx = alvo.x - inimigo.x;
    const dz = alvo.z - inimigo.z;
    const alcanceDoPulo = ia.velocidade * ia.duracao_pulo;
    const andar = Math.min(perto - ia.alcance * 0.6, alcanceDoPulo);
    inimigo.estado = 'pulando';
    inimigo.tempo = ia.duracao_pulo;
    inimigo.deX = inimigo.x;
    inimigo.deZ = inimigo.z;
    inimigo.paraX = inimigo.x + (dx / perto) * Math.max(andar, 0);
    inimigo.paraZ = inimigo.z + (dz / perto) * Math.max(andar, 0);
  }
  return null;
}

/** Água-viva: vai devagar até o jogador, carrega e solta um choque em área. */
function passoFlutuante(
  inimigo: EnemyRuntime,
  ia: Flutuante,
  jogadores: readonly AlvoDoInimigo[],
  alvo: AlvoDoInimigo,
  perto: number,
  dt: number,
): Acao | null {
  // Balança no lugar, como quem boia.
  inimigo.fase += dt * 2.2;
  inimigo.y = ia.altura + Math.sin(inimigo.fase) * 0.15;

  if (inimigo.estado === 'carregando') {
    // Parada e brilhando: é o aviso do choque.
    inimigo.tempo -= dt;
    if (inimigo.tempo > 0) return null;

    inimigo.estado = 'flutuando';
    inimigo.recarga = ia.recarga;
    // Quem estiver na área no instante da descarga leva o choque.
    const atingidos = jogadores
      .filter((jogador) => jogador.atacavel && distancia(inimigo, jogador) <= ia.alcance + 0.3)
      .map((jogador) => jogador.sessionId);
    return atingidos.length > 0
      ? { tipo: 'choque', inimigo: inimigo.id, alvos: atingidos, dano: danoDe(inimigo) }
      : null;
  }

  virarPara(inimigo, alvo, GIRO * 0.5 * dt);
  inimigo.estado = 'flutuando';

  if (perto > ia.alcance * 0.85) {
    andarPara(inimigo, alvo, ia.velocidade, dt);
    return null;
  }

  if (inimigo.recarga <= 0) {
    inimigo.estado = 'carregando';
    inimigo.tempo = ia.carga;
  }
  return null;
}

function danoDe(inimigo: EnemyRuntime): number {
  return getEnemy(inimigo.tipo).dano;
}

/** Marca o inimigo como ferido e devolve se ele morreu com este golpe. */
export function levarGolpe(inimigo: EnemyRuntime, dano: number): boolean {
  inimigo.hp = Math.max(0, inimigo.hp - dano);
  if (inimigo.hp === 0) {
    inimigo.estado = 'morto';
    return true;
  }
  // No meio do pulo ou do mergulho ele não para: congelaria no ar.
  const noAr = inimigo.estado === 'pulando' || inimigo.estado === 'mergulhando';
  if (dano > 0 && !noAr) inimigo.atordoado = FLINCH_SECONDS;
  return false;
}
