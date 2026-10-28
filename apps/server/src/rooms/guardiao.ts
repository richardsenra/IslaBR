import { content, getEnemy, type WorldBoss } from '@islabr/content';
import {
  criarInimigo,
  type Acao,
  type AlvoDoInimigo,
  type AvisoDeArea,
  type EnemyRuntime,
} from './enemyAI.js';

/**
 * A luta do Tentáculo-Guardião (SPEC §7.6), a mais longa do jogo (3 a 5 min).
 *
 * Um núcleo no meio da sala e quatro tentáculos nos cantos. Os tentáculos batem
 * no chão onde está um jogador (círculo vermelho de aviso, como nos
 * mini-chefes); cortar um abre uma janela em que o núcleo toma dano.
 *
 * - Fase 1 (20): o núcleo só toma dano durante a janela aberta por um corte.
 * - Fase 2 (20): a maré sobe e quem fica no chão se machuca; só as plataformas
 *   são seguras. O chefe lança tinta que escurece a tela.
 * - Fase 3 (15): batidas mais rápidas, em salvas, e o núcleo sempre vulnerável.
 *
 * A vida escala com quem está na sala quando a luta começa, para valer para um e
 * para quatro jogadores. A luta é do servidor, não de um jogador: se quem a
 * começou sair, os outros seguem; sala vazia por um tempo zera tudo.
 */

const IDS_DOS_TENTACULOS = ['boss1_t1', 'boss1_t2', 'boss1_t3', 'boss1_t4'] as const;
export const ID_DO_NUCLEO = 'boss1_nucleo';

/** Quanto a vida do núcleo cresce por jogador extra na sala. */
const VIDA_POR_JOGADOR_EXTRA = 0.5;
/** Segundos com a sala vazia até a luta zerar. */
const SALA_VAZIA_ZERA_EM = 10;
/** Segundos depois da vitória até o chefe poder ser enfrentado de novo. */
const VOLTA_APOS_VITORIA = 60;
/** Segundos até um tentáculo cortado crescer de novo. */
const TENTACULO_VOLTA_EM = 12;
/** Segundos de janela no núcleo depois de um corte. */
const JANELA_SEGUNDOS = 8;
/** A água sobe até o máximo em tantos segundos. */
const AGUA_SOBE_EM = 20;
/** Quem está no chão com a maré cheia leva meio coração a cada tantos segundos. */
const INTERVALO_DO_AFOGO = 2;
const TINTA_A_CADA = 14;
const TINTA_DURA = 6;
const SALVA_A_CADA = 10;

/** Fração da vida total em que cada fase termina (20 + 20 + 15 de 55). */
const FIM_DA_FASE_1 = 35 / 55;
const FIM_DA_FASE_2 = 15 / 55;

interface PerfilDaFase {
  /** Segundos entre uma batida e outra de cada tentáculo. */
  readonly ciclo: number;
  /** Segundos entre o círculo aparecer e a batida cair. */
  readonly aviso: number;
}

const PERFIS: Readonly<Record<1 | 2 | 3, PerfilDaFase>> = {
  1: { ciclo: 5, aviso: 1.4 },
  2: { ciclo: 3.8, aviso: 1.1 },
  3: { ciclo: 2.8, aviso: 0.85 },
};

const RAIO_DA_BATIDA = 2.1;

interface BatidaPendente {
  readonly x: number;
  readonly z: number;
  falta: number;
  readonly quem: string;
}

export interface SaidaDoGuardiao {
  readonly acoes: Acao[];
  readonly avisos: AvisoDeArea[];
  /** Jogadores que a tinta acertou. */
  readonly tinta: string[];
  /** A luta acabou agora: quem estava na sala venceu. */
  readonly vitoria: string[] | null;
}

/** O que o cliente precisa saber da luta para desenhar a água, a barra e a tinta. */
export interface EstadoDaLuta {
  readonly ativa: boolean;
  readonly fase: 1 | 2 | 3;
  readonly agua: number;
  readonly janela: number;
  readonly hp: number;
  readonly hpMax: number;
}

export class Guardiao {
  readonly nucleo: EnemyRuntime;
  readonly tentaculos: EnemyRuntime[];

  private readonly sala: WorldBoss['sala'];
  private readonly aguaMax: number;
  private readonly hpBase: number;

  private ativa = false;
  fase: 1 | 2 | 3 = 1;
  agua = 0;
  janela = 0;
  private salaVazia = 0;
  private apos = 0;
  private proximaTinta = TINTA_A_CADA;
  private proximaSalva = SALVA_A_CADA;
  private readonly afogo = new Map<string, number>();
  private readonly voltaDoTentaculo = new Map<string, number>();
  private readonly ciclo = new Map<string, number>();
  private pendentes: BatidaPendente[] = [];
  /** Quem esteve na sala durante a luta: é quem ganha a vitória. */
  readonly participantes = new Set<string>();
  /** Quem levou dano da luta: sem isso, a insígnia b08 (SPEC §7.5). */
  readonly feridos = new Set<string>();

  constructor(boss: WorldBoss = content.world.guardiao) {
    this.sala = boss.sala;
    this.aguaMax = boss.agua_max;
    this.hpBase = getEnemy('boss1').hp;
    this.nucleo = criarInimigo(ID_DO_NUCLEO, 'boss1', boss.nucleo.x, boss.nucleo.z);
    this.nucleo.y = 1.2;
    this.tentaculos = boss.tentaculos.map((posto, i) =>
      criarInimigo(IDS_DOS_TENTACULOS[i] ?? `boss1_t${i + 1}`, 'tentaculo', posto.x, posto.z),
    );
    this.resetar();
  }

  /** Todos os bichos da luta, para a sala registrar. */
  get todos(): EnemyRuntime[] {
    return [this.nucleo, ...this.tentaculos];
  }

  ehDaLuta(id: string): boolean {
    return id === this.nucleo.id || this.tentaculos.some((t) => t.id === id);
  }

  get estado(): EstadoDaLuta {
    return {
      ativa: this.ativa,
      fase: this.fase,
      agua: this.agua,
      janela: this.janela,
      hp: this.nucleo.hp,
      hpMax: this.hpMax,
    };
  }

  private hpMax = 0;

  dentroDaSala(x: number, z: number): boolean {
    return x >= this.sala.minX && x <= this.sala.maxX && z >= this.sala.minZ && z <= this.sala.maxZ;
  }

  /** Volta tudo ao começo: vida cheia, tentáculos em pé, água embaixo. */
  resetar(): void {
    this.ativa = false;
    this.fase = 1;
    this.agua = 0;
    this.janela = 0;
    this.salaVazia = 0;
    this.apos = 0;
    this.proximaTinta = TINTA_A_CADA;
    this.proximaSalva = SALVA_A_CADA;
    this.afogo.clear();
    this.voltaDoTentaculo.clear();
    this.pendentes = [];
    this.participantes.clear();
    this.feridos.clear();
    this.hpMax = this.hpBase;
    this.nucleo.hp = this.hpBase;
    this.nucleo.estado = 'parado';
    this.nucleo.invulneravel = true;
    for (const [i, tentaculo] of this.tentaculos.entries()) {
      tentaculo.hp = getEnemy('tentaculo').hp;
      tentaculo.estado = 'parado';
      this.ciclo.set(tentaculo.id, 1 + i * 0.9);
    }
  }

  /** Um tentáculo ou o núcleo foi derrubado por um golpe. */
  aoMorrer(id: string): void {
    if (id === this.nucleo.id) {
      this.apos = VOLTA_APOS_VITORIA;
      return;
    }
    this.voltaDoTentaculo.set(id, TENTACULO_VOLTA_EM);
    // Cortar um tentáculo abre a janela de dano no núcleo (fase 1).
    this.janela = JANELA_SEGUNDOS;
    this.pendentes = this.pendentes.filter((batida) => batida.quem !== id);
  }

  aoMachucar(sessionId: string): void {
    this.feridos.add(sessionId);
  }

  passo(dt: number, jogadores: readonly AlvoDoInimigo[]): SaidaDoGuardiao {
    const saida: SaidaDoGuardiao = { acoes: [], avisos: [], tinta: [], vitoria: null };
    const naSala = jogadores.filter(
      (jogador) => jogador.atacavel && this.dentroDaSala(jogador.x, jogador.z),
    );

    // Depois da vitória o chefe fica morto um tempo e volta inteiro.
    if (this.nucleo.estado === 'morto') {
      this.apos -= dt;
      if (this.apos <= 0) this.resetar();
      return saida;
    }

    if (!this.ativa) {
      if (naSala.length === 0) return saida;
      this.comecar(naSala.length);
    }

    for (const jogador of naSala) this.participantes.add(jogador.sessionId);

    // Sala vazia por um tempo: zera, para o próximo grupo pegar o chefe inteiro.
    if (naSala.length === 0) {
      this.salaVazia += dt;
      if (this.salaVazia >= SALA_VAZIA_ZERA_EM) this.resetar();
      return saida;
    }
    this.salaVazia = 0;

    this.atualizarFase();
    this.cuidarDaJanela(dt);
    this.cuidarDosTentaculos(dt);
    this.cuidarDasBatidas(dt, naSala, saida);
    this.sortearBatidas(dt, naSala, saida);
    this.cuidarDaMare(dt, naSala, saida);
    this.cuidarDaTinta(dt, naSala, saida);
    return saida;
  }

  /** Chamado pela sala quando o núcleo morre. */
  venceu(): string[] {
    this.ativa = false;
    this.nucleo.invulneravel = true;
    this.apos = VOLTA_APOS_VITORIA;
    for (const tentaculo of this.tentaculos) tentaculo.estado = 'morto';
    return [...this.participantes];
  }

  private comecar(jogadores: number): void {
    this.ativa = true;
    this.hpMax = Math.round(this.hpBase * (1 + VIDA_POR_JOGADOR_EXTRA * (jogadores - 1)));
    this.nucleo.hp = this.hpMax;
  }

  private atualizarFase(): void {
    const fracao = this.nucleo.hp / this.hpMax;
    const nova = fracao > FIM_DA_FASE_1 ? 1 : fracao > FIM_DA_FASE_2 ? 2 : 3;
    if (nova !== this.fase) {
      this.fase = nova;
      // Cada fase nova recomeça os tempos, para a tinta e a salva não virem juntas.
      this.proximaTinta = TINTA_A_CADA / 2;
      this.proximaSalva = SALVA_A_CADA / 2;
    }
  }

  private cuidarDaJanela(dt: number): void {
    this.janela = Math.max(0, this.janela - dt);
    const aberta = this.fase >= 2 || this.janela > 0;
    this.nucleo.invulneravel = !aberta;
    if (this.nucleo.estado !== 'morto') this.nucleo.estado = aberta ? 'vulneravel' : 'parado';
  }

  private cuidarDosTentaculos(dt: number): void {
    for (const tentaculo of this.tentaculos) {
      if (tentaculo.estado !== 'morto') continue;
      const falta = (this.voltaDoTentaculo.get(tentaculo.id) ?? 0) - dt;
      if (falta > 0) {
        this.voltaDoTentaculo.set(tentaculo.id, falta);
        continue;
      }
      this.voltaDoTentaculo.delete(tentaculo.id);
      tentaculo.hp = getEnemy('tentaculo').hp;
      tentaculo.estado = 'parado';
      this.ciclo.set(tentaculo.id, PERFIS[this.fase].ciclo);
    }
  }

  /** Cada tentáculo vivo escolhe um jogador e avisa onde vai bater. */
  private sortearBatidas(
    dt: number,
    naSala: readonly AlvoDoInimigo[],
    saida: SaidaDoGuardiao,
  ): void {
    const perfil = PERFIS[this.fase];
    for (const tentaculo of this.tentaculos) {
      if (tentaculo.estado === 'morto') continue;
      const falta = (this.ciclo.get(tentaculo.id) ?? perfil.ciclo) - dt;
      if (falta > 0) {
        this.ciclo.set(tentaculo.id, falta);
        continue;
      }
      this.ciclo.set(tentaculo.id, perfil.ciclo);
      const alvo = naSala[Math.floor(Math.random() * naSala.length)];
      if (!alvo) continue;
      this.avisarBatida(tentaculo.id, alvo.x, alvo.z, perfil.aviso, saida);
      tentaculo.estado = 'preparando';
      tentaculo.tempo = perfil.aviso;
    }

    // Fase 3: de tempos em tempos todos batem juntos, um em cada jogador.
    if (this.fase === 3) {
      this.proximaSalva -= dt;
      if (this.proximaSalva <= 0) {
        this.proximaSalva = SALVA_A_CADA;
        for (const alvo of naSala) {
          this.avisarBatida('salva', alvo.x, alvo.z, perfil.aviso + 0.3, saida);
        }
      }
    }
  }

  private avisarBatida(
    quem: string,
    x: number,
    z: number,
    segundos: number,
    saida: SaidaDoGuardiao,
  ): void {
    this.pendentes.push({ x, z, falta: segundos, quem });
    saida.avisos.push({ x, z, raio: RAIO_DA_BATIDA, segundos });
  }

  private cuidarDasBatidas(
    dt: number,
    naSala: readonly AlvoDoInimigo[],
    saida: SaidaDoGuardiao,
  ): void {
    for (const tentaculo of this.tentaculos) {
      if (tentaculo.estado === 'preparando') {
        tentaculo.tempo -= dt;
        if (tentaculo.tempo <= 0) tentaculo.estado = 'parado';
      }
    }
    const restantes: BatidaPendente[] = [];
    for (const batida of this.pendentes) {
      batida.falta -= dt;
      if (batida.falta > 0) {
        restantes.push(batida);
        continue;
      }
      const alvos = naSala
        .filter(
          (jogador) => Math.hypot(jogador.x - batida.x, jogador.z - batida.z) <= RAIO_DA_BATIDA,
        )
        .map((jogador) => jogador.sessionId);
      if (alvos.length > 0) {
        saida.acoes.push({
          tipo: 'choque',
          inimigo: this.nucleo.id,
          alvos,
          dano: getEnemy('tentaculo').dano,
        });
      }
    }
    this.pendentes = restantes;
  }

  /** Fase 2 em diante: a água sobe e quem está no chão se afoga aos poucos. */
  private cuidarDaMare(dt: number, naSala: readonly AlvoDoInimigo[], saida: SaidaDoGuardiao): void {
    if (this.fase < 2) {
      this.agua = Math.max(0, this.agua - dt * 0.5);
      return;
    }
    this.agua = Math.min(this.aguaMax, this.agua + (this.aguaMax / AGUA_SOBE_EM) * dt);
    const molhados: string[] = [];
    for (const jogador of naSala) {
      if (jogador.y > this.agua - 0.05) {
        this.afogo.delete(jogador.sessionId);
        continue;
      }
      const falta = (this.afogo.get(jogador.sessionId) ?? INTERVALO_DO_AFOGO) - dt;
      if (falta > 0) {
        this.afogo.set(jogador.sessionId, falta);
        continue;
      }
      this.afogo.set(jogador.sessionId, INTERVALO_DO_AFOGO);
      molhados.push(jogador.sessionId);
    }
    if (molhados.length > 0) {
      saida.acoes.push({ tipo: 'choque', inimigo: this.nucleo.id, alvos: molhados, dano: 0.5 });
    }
  }

  private cuidarDaTinta(
    dt: number,
    naSala: readonly AlvoDoInimigo[],
    saida: SaidaDoGuardiao,
  ): void {
    if (this.fase < 2) return;
    this.proximaTinta -= dt;
    if (this.proximaTinta > 0) return;
    this.proximaTinta = TINTA_A_CADA;
    for (const jogador of naSala) saida.tinta.push(jogador.sessionId);
  }
}

export const SEGUNDOS_DE_TINTA = TINTA_DURA;
