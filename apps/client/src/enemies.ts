import * as THREE from 'three';
import { getEnemy } from '@islabr/content';
import { SnapshotBuffer } from '@islabr/shared';
import type { NetEnemy } from './network.js';

/** Quanto tempo o corpo leva para sumir depois de morrer. */
const MORTE_SEGUNDOS = 0.45;
/** Quanto tempo o brilho e o amassado de "levei golpe" duram. */
const FLASH_SEGUNDOS = 0.18;

/** Estados em que o bicho já percebeu o jogador e está na briga. */
const EM_ALERTA: ReadonlySet<string> = new Set([
  'perseguindo',
  'atacando',
  'ferido',
  'orbitando',
  'preparando',
  'mergulhando',
  'recuando',
  'pulando',
  'cuspindo',
  'carregando',
]);

/** Estados em que o bicho está perto do chão e pode esconder atrás do jogador. */
const ESCONDIVEIS: ReadonlySet<string> = new Set([
  'perseguindo',
  'atacando',
  'ferido',
  'pulando',
  'cuspindo',
  'carregando',
  'mergulhando',
]);

// Geometria compartilhada para a sombra no chão (zero custo extra de GPU)
const SOMBRA_GEO = new THREE.CircleGeometry(0.55, 24);
SOMBRA_GEO.rotateX(-Math.PI / 2);
const SOMBRA_MAT = new THREE.MeshBasicMaterial({
  color: '#142411',
  transparent: true,
  opacity: 0.32,
  depthWrite: false,
});

/** Base de todo bicho: materiais, brilho de golpe, aviso colorido e morte. */
abstract class Criatura {
  readonly raiz = new THREE.Group();
  abstract readonly alturaDaBarra: number;

  protected readonly corpo = new THREE.Group();
  private readonly materiais: THREE.MeshLambertMaterial[] = [];
  private readonly extras: THREE.Material[] = [];
  protected tempo = Math.random() * Math.PI * 2;
  private flash = 0;
  private morte = 0;
  private avisoCor = new THREE.Color(0xffffff);
  private avisoForca = 0;

  constructor() {
    this.raiz.add(this.corpo);
  }

  protected material(
    cor: string,
    opcoes: THREE.MeshLambertMaterialParameters = {},
  ): THREE.MeshLambertMaterial {
    const material = new THREE.MeshLambertMaterial({ color: cor, ...opcoes });
    this.materiais.push(material);
    return material;
  }

  protected extra<T extends THREE.Material>(material: T): T {
    this.extras.push(material);
    return material;
  }

  /** Acende o corpo e aplica impacto elástico (Squash & Stretch). */
  acertar(): void {
    this.flash = FLASH_SEGUNDOS;
  }

  protected avisar(cor: number, forca: number): void {
    this.avisoCor.setHex(cor);
    this.avisoForca = forca;
  }

  reviver(): void {
    this.morte = 0;
    this.flash = 0;
    this.avisoForca = 0;
    this.raiz.visible = true;
    this.corpo.rotation.set(0, 0, 0);
    this.corpo.position.set(0, 0, 0);
    this.corpo.scale.setScalar(1);
  }

  animar(estado: string, dt: number): void {
    this.tempo += dt;
    this.flash = Math.max(0, this.flash - dt);

    const golpe = this.flash > 0 ? this.flash / FLASH_SEGUNDOS : 0;
    for (const material of this.materiais) {
      if (golpe > 0) {
        material.emissive.setScalar(golpe * 0.95);
      } else {
        material.emissive.copy(this.avisoCor).multiplyScalar(this.avisoForca);
      }
    }

    if (estado === 'morto') {
      this.avisoForca = 0;
      this.morte += dt;
      const t = Math.min(this.morte / MORTE_SEGUNDOS, 1);
      this.corpo.rotation.z = t * Math.PI;
      this.corpo.position.y = t * 0.25;
      this.corpo.scale.setScalar(Math.max(1 - t * t, 0.001));
      this.raiz.visible = t < 1;
      return;
    }

    this.avisoForca = 0;
    this.animarVivo(estado, dt);

    // Squash & Stretch de impacto quando apanha (estilo Genshin/anime):
    // achata na vertical e alarga na horizontal nos primeiros milissegundos do hit!
    if (golpe > 0) {
      const impactoElastico = Math.sin(golpe * Math.PI);
      this.corpo.scale.x *= 1 + impactoElastico * 0.28;
      this.corpo.scale.y *= 1 - impactoElastico * 0.24;
      this.corpo.scale.z *= 1 + impactoElastico * 0.28;
    }
  }

  protected abstract animarVivo(estado: string, dt: number): void;

  descartar(): void {
    this.raiz.traverse((objeto) => {
      if (objeto instanceof THREE.Mesh) objeto.geometry.dispose();
    });
    for (const material of this.materiais) material.dispose();
    for (const material of this.extras) material.dispose();
  }
}

const COR_COMUM = '#e4572e';
const COR_ESPINHOSO = '#6d2e2a';
const COR_ESPINHO = '#f2c14e';

interface Garra {
  readonly pivo: THREE.Group;
  readonly lado: 1 | -1;
}

class Caranguejo extends Criatura {
  readonly alturaDaBarra: number;

  private readonly pernas: THREE.Mesh[] = [];
  private readonly garras: Garra[] = [];

  constructor(espinhoso: boolean) {
    super();
    this.alturaDaBarra = espinhoso ? 1.9 : 1.55;
    const cor = espinhoso ? COR_ESPINHOSO : COR_COMUM;
    const casco = this.material(cor);
    const claro = this.material(espinhoso ? '#8a403a' : '#f08a5d');
    const branco = this.material('#ffffff');
    const pupila = this.material('#22222c');

    const tronco = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 12), casco);
    tronco.scale.set(1.15, 0.6, 0.85);
    tronco.position.y = 0.34;
    this.corpo.add(tronco);

    for (const lado of [-1, 1] as const) {
      const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 6), claro);
      haste.position.set(lado * 0.18, 0.66, 0.32);
      const olho = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), branco);
      olho.position.set(lado * 0.18, 0.78, 0.34);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), pupila);
      iris.position.set(lado * 0.18, 0.78, 0.4);
      this.corpo.add(haste, olho, iris);
    }

    for (const lado of [-1, 1] as const) {
      const pivo = new THREE.Group();
      pivo.position.set(lado * 0.5, 0.36, 0.22);
      const braco = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.22), claro);
      braco.position.z = 0.11;
      const pinca = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 8), casco);
      pinca.scale.set(1.15, 0.85, 1.05);
      pinca.position.z = 0.3;
      pivo.add(braco, pinca);
      this.corpo.add(pivo);
      this.garras.push({ pivo, lado });
    }

    for (const lado of [-1, 1] as const) {
      for (let i = 0; i < 3; i += 1) {
        const perna = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.05), claro);
        perna.position.set(lado * 0.48, 0.2, -0.18 + i * 0.2);
        perna.rotation.z = lado * -0.45;
        this.corpo.add(perna);
        this.pernas.push(perna);
      }
    }

    if (espinhoso) {
      const espinho = this.material(COR_ESPINHO);
      for (let i = 0; i < 7; i += 1) {
        const ponta = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.32, 6), espinho);
        const angulo = (i / 6 - 0.5) * 1.8;
        ponta.position.set(Math.sin(angulo) * 0.38, 0.62 + Math.cos(angulo) * 0.1, -0.12);
        ponta.rotation.z = -angulo * 0.8;
        this.corpo.add(ponta);
      }
      this.raiz.scale.setScalar(1.75);
    } else {
      this.raiz.scale.setScalar(1.45);
    }
  }

  protected animarVivo(estado: string, dt: number): void {
    const correndo = estado === 'perseguindo';
    const atacando = estado === 'atacando';
    this.tempo += dt * (correndo ? 15 : atacando ? 8 : 1);

    this.corpo.position.x = correndo ? Math.sin(this.tempo * 0.5) * 0.04 : 0;
    this.corpo.position.y = correndo ? Math.abs(Math.sin(this.tempo)) * 0.05 : 0;
    this.pernas.forEach((perna, indice) => {
      const lado = indice < 3 ? -1 : 1;
      const base = lado * -0.45;
      perna.rotation.z = base + (correndo ? Math.sin(this.tempo + indice * 1.3) * 0.35 : 0);
    });

    for (const { pivo, lado } of this.garras) {
      const estalo = atacando ? Math.max(0, Math.sin(this.tempo)) * 0.7 : 0;
      pivo.rotation.y = lado * (0.15 + estalo);
      pivo.rotation.x = atacando ? -0.35 * Math.max(0, Math.sin(this.tempo)) : 0;
    }

    this.corpo.scale.set(1, estado === 'ferido' ? 0.85 : 1, 1);
  }
}

class Mosquito extends Criatura {
  readonly alturaDaBarra = 0.9;

  private readonly asas: THREE.Group[] = [];

  constructor() {
    super();
    const pelo = this.material('#4a3b2a');
    const barriga = this.material('#7a6a3f');
    const olhoMat = this.material('#d94141');
    const asa = this.extra(
      new THREE.MeshBasicMaterial({
        color: '#e8f3ff',
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      }),
    );

    const torax = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), pelo);
    torax.scale.set(0.8, 0.75, 1.3);
    torax.position.y = 0.45;
    const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), barriga);
    abdomen.scale.set(0.8, 0.75, 1.7);
    abdomen.position.set(0, 0.42, -0.36);
    const cabeca = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), pelo);
    cabeca.position.set(0, 0.47, 0.3);
    const proboscide = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.4, 6), barriga);
    proboscide.rotation.x = Math.PI / 2;
    proboscide.position.set(0, 0.43, 0.58);
    this.corpo.add(torax, abdomen, cabeca, proboscide);

    for (const lado of [-1, 1] as const) {
      const olho = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), olhoMat);
      olho.position.set(lado * 0.09, 0.51, 0.38);
      this.corpo.add(olho);

      const pivo = new THREE.Group();
      pivo.position.set(lado * 0.12, 0.6, 0.02);
      const folha = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.012, 0.22), asa);
      folha.position.x = lado * 0.28;
      pivo.add(folha);
      this.corpo.add(pivo);
      this.asas.push(pivo);
    }
    this.raiz.scale.setScalar(1.7);
  }

  protected animarVivo(estado: string, dt: number): void {
    const frequencia = estado === 'mergulhando' ? 70 : 52;
    this.asas.forEach((asa, indice) => {
      const lado = indice === 0 ? -1 : 1;
      asa.rotation.z = lado * Math.sin(this.tempo * frequencia) * 0.7;
    });

    const mergulhando = estado === 'mergulhando';
    this.corpo.rotation.x = mergulhando ? 0.75 : estado === 'recuando' ? -0.5 : 0.08;
    const pairando = estado === 'orbitando' || estado === 'parado';
    this.corpo.position.y = pairando ? Math.sin(this.tempo * 4) * 0.05 : 0;
    this.corpo.scale.setScalar(1);

    if (estado === 'preparando') {
      this.corpo.position.x = Math.sin(this.tempo * 90) * 0.03;
      this.avisar(0xff2020, 0.45 + 0.35 * Math.sin(this.tempo * 40));
    } else {
      this.corpo.position.x = 0;
    }
    void dt;
  }
}

class Sapo extends Criatura {
  readonly alturaDaBarra = 1.5;

  private readonly pernasTraseiras: THREE.Mesh[] = [];

  constructor() {
    super();
    const pele = this.material('#5f9e45');
    const barriga = this.material('#c9e265');
    const branco = this.material('#fffbe0');
    const pupila = this.material('#1d2a1a');
    const boca = this.material('#2f4a27');

    const tronco = new THREE.Mesh(new THREE.SphereGeometry(0.45, 18, 12), pele);
    tronco.scale.set(1, 0.78, 1.15);
    tronco.position.y = 0.38;
    const papo = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), barriga);
    papo.scale.set(1, 0.7, 0.9);
    papo.position.set(0, 0.3, 0.3);
    const sorriso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.05), boca);
    sorriso.position.set(0, 0.4, 0.52);
    this.corpo.add(tronco, papo, sorriso);

    for (const lado of [-1, 1] as const) {
      const olho = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), branco);
      olho.position.set(lado * 0.2, 0.78, 0.25);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), pupila);
      iris.position.set(lado * 0.2, 0.79, 0.34);
      this.corpo.add(olho, iris);

      const frente = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.3, 8), pele);
      frente.position.set(lado * 0.3, 0.17, 0.4);
      this.corpo.add(frente);

      const coxa = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), pele);
      coxa.scale.set(0.7, 0.7, 1.4);
      coxa.position.set(lado * 0.42, 0.22, -0.2);
      this.corpo.add(coxa);
      this.pernasTraseiras.push(coxa);
    }
    this.raiz.scale.setScalar(1.35);
  }

  protected animarVivo(estado: string, dt: number): void {
    void dt;
    let largura = 1;
    let altura: number;
    let comprimento = 1;

    switch (estado) {
      case 'pulando':
        largura = 0.88;
        altura = 1.18;
        comprimento = 1.1;
        break;
      case 'cuspindo': {
        const pulso = 0.5 + 0.5 * Math.sin(this.tempo * 18);
        largura = 1.2 + pulso * 0.12;
        altura = 1.2 + pulso * 0.1;
        comprimento = 1.12;
        this.avisar(0x9be15d, 0.35 + pulso * 0.3);
        break;
      }
      case 'ferido':
        altura = 0.8;
        largura = 1.12;
        break;
      default:
        altura = 1 + Math.sin(this.tempo * 3) * 0.035;
    }

    this.corpo.scale.set(largura, altura, comprimento);
    this.pernasTraseiras.forEach((coxa) => {
      coxa.rotation.x = estado === 'pulando' ? -0.7 : 0;
    });
  }
}

class AguaViva extends Criatura {
  readonly alturaDaBarra = 1.6;

  private readonly tentaculos: THREE.Mesh[] = [];
  private readonly miolo: THREE.MeshBasicMaterial;
  private readonly cupula: THREE.MeshLambertMaterial;
  private readonly anel: THREE.Mesh;
  private readonly anelMaterial: THREE.MeshBasicMaterial;
  private anelTempo = 0;
  private estadoAnterior = 'flutuando';
  private readonly raioDoChoque: number;

  constructor() {
    super();
    const ia = getEnemy('e05').ia;
    this.raioDoChoque = ia?.tipo === 'flutuante' ? ia.alcance + 0.3 : 3;

    this.cupula = this.material('#7fd6ff', {
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide,
    });
    const tentaculo = this.material('#a8e6ff', { transparent: true, opacity: 0.75 });
    this.miolo = this.extra(
      new THREE.MeshBasicMaterial({ color: '#c8f4ff', transparent: true, opacity: 0.8 }),
    );

    const cupula = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      this.cupula,
    );
    cupula.position.y = 0.55;
    const nucleo = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), this.miolo);
    nucleo.position.y = 0.6;
    this.corpo.add(cupula, nucleo);

    for (let i = 0; i < 7; i += 1) {
      const angulo = (i / 7) * Math.PI * 2;
      const fio = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.012, 0.7, 6), tentaculo);
      fio.geometry.translate(0, -0.35, 0);
      fio.position.set(Math.cos(angulo) * 0.32, 0.55, Math.sin(angulo) * 0.32);
      this.corpo.add(fio);
      this.tentaculos.push(fio);
    }

    this.anelMaterial = this.extra(
      new THREE.MeshBasicMaterial({
        color: '#ffffaa',
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.anel = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), this.anelMaterial);
    this.anel.rotation.x = -Math.PI / 2;
    this.anel.position.y = 0.05;
    this.anel.visible = false;
    this.raiz.add(this.anel);

    this.raiz.scale.setScalar(1.3);
  }

  override reviver(): void {
    super.reviver();
    this.anel.visible = false;
    this.anelTempo = 0;
  }

  protected animarVivo(estado: string, dt: number): void {
    this.tentaculos.forEach((fio, indice) => {
      fio.rotation.x = Math.sin(this.tempo * 2.4 + indice) * 0.25;
      fio.rotation.z = Math.cos(this.tempo * 2 + indice * 1.7) * 0.25;
    });

    const pulso = 1 + Math.sin(this.tempo * 2.2) * 0.04;
    this.corpo.scale.set(pulso, 1 / pulso, pulso);

    if (estado === 'carregando') {
      const carga = 0.5 + 0.5 * Math.sin(this.tempo * 16);
      this.avisar(0xfff2a0, 0.4 + carga * 0.5);
      this.miolo.color.set('#ffffcc');
      this.cupula.opacity = 0.8;
      this.corpo.scale.multiplyScalar(1.1);
    } else {
      this.miolo.color.set('#c8f4ff');
      this.cupula.opacity = 0.62;
    }

    if (this.estadoAnterior === 'carregando' && estado !== 'carregando') {
      this.anelTempo = 0.35;
      this.anel.visible = true;
    }
    this.estadoAnterior = estado;

    if (this.anelTempo > 0) {
      this.anelTempo = Math.max(0, this.anelTempo - dt);
      const t = 1 - this.anelTempo / 0.35;
      this.anel.scale.setScalar((0.4 + t * 0.6) * (this.raioDoChoque / this.raiz.scale.x));
      this.anelMaterial.opacity = 0.85 * (1 - t);
      if (this.anelTempo === 0) this.anel.visible = false;
    }
  }
}

function criarCriatura(tipo: string): Criatura {
  switch (tipo) {
    case 'e03':
      return new Mosquito();
    case 'e04':
      return new Sapo();
    case 'e05':
      return new AguaViva();
    case 'e02':
      return new Caranguejo(true);
    default:
      return new Caranguejo(false);
  }
}

class BarraDeVida {
  readonly sprite: THREE.Sprite;

  private readonly canvas = document.createElement('canvas');
  private readonly textura: THREE.CanvasTexture;
  private ultimaFracao = -1;

  constructor() {
    this.canvas.width = 64;
    this.canvas.height = 10;
    this.textura = new THREE.CanvasTexture(this.canvas);
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.textura, depthTest: false }),
    );
    this.sprite.scale.set(0.9, 0.14, 1);
    this.sprite.renderOrder = 9;
    this.sprite.visible = false;
  }

  atualizar(hp: number, hpMax: number, morto: boolean, alerta: boolean): void {
    const fracao = hpMax > 0 ? hp / hpMax : 0;
    this.sprite.visible = !morto && (fracao < 1 || alerta);
    if (fracao === this.ultimaFracao) return;
    this.ultimaFracao = fracao;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 64, 10);
    ctx.fillStyle = '#1b1b24';
    ctx.fillRect(0, 0, 64, 10);
    ctx.fillStyle = fracao > 0.5 ? '#7bd34f' : fracao > 0.25 ? '#ffd23f' : '#ef476f';
    ctx.fillRect(1, 1, Math.max(0, 62 * fracao), 8);
    this.textura.needsUpdate = true;
  }

  descartar(): void {
    this.textura.dispose();
    this.sprite.material.dispose();
  }
}

interface Visao {
  readonly criatura: Criatura;
  readonly barra: BarraDeVida;
  readonly sombra: THREE.Mesh;
  readonly raiz: THREE.Group;
  buffer: SnapshotBuffer;
  estado: string;
  hp: number;
  hpMax: number;
  tipo: string;
}

export class Enemies {
  readonly group = new THREE.Group();

  private readonly visoes = new Map<string, Visao>();

  constructor() {
    this.group.name = 'inimigos';
  }

  sync(inimigos: readonly NetEnemy[], chegouEm: number): void {
    const presentes = new Set<string>();

    for (const dado of inimigos) {
      presentes.add(dado.id);
      let visao = this.visoes.get(dado.id);

      if (!visao) {
        const criatura = criarCriatura(dado.tipo);
        const barra = new BarraDeVida();
        const sombra = new THREE.Mesh(SOMBRA_GEO, SOMBRA_MAT);
        const raiz = new THREE.Group();
        raiz.add(criatura.raiz, barra.sprite, sombra);
        barra.sprite.position.y = criatura.alturaDaBarra;
        this.group.add(raiz);
        visao = {
          criatura,
          barra,
          sombra,
          raiz,
          buffer: new SnapshotBuffer(),
          estado: dado.estado,
          hp: dado.hp,
          hpMax: dado.hpMax,
          tipo: dado.tipo,
        };
        this.visoes.set(dado.id, visao);
        raiz.position.set(dado.x, dado.y, dado.z);
      }

      if (visao.estado === 'morto' && dado.estado !== 'morto') {
        visao.criatura.reviver();
        visao.buffer = new SnapshotBuffer();
        visao.raiz.position.set(dado.x, dado.y, dado.z);
      }

      visao.estado = dado.estado;
      visao.hp = dado.hp;
      visao.hpMax = dado.hpMax;
      visao.buffer.push({
        t: chegouEm,
        x: dado.x,
        y: dado.y,
        z: dado.z,
        yaw: dado.yaw,
        state: 'idle',
      });
    }

    for (const [id, visao] of this.visoes) {
      if (presentes.has(id)) continue;
      this.group.remove(visao.raiz);
      visao.criatura.descartar();
      visao.barra.descartar();
      this.visoes.delete(id);
    }
  }

  update(agora: number, dt: number): void {
    for (const visao of this.visoes.values()) {
      if (visao.estado !== 'morto') {
        const pose = visao.buffer.sample(agora);
        if (pose) {
          visao.raiz.position.set(pose.x, pose.y, pose.z);
          visao.raiz.rotation.y = pose.yaw;
        }
      }

      // Mantém a sombra projetada no chão (y = 0.02 do mundo), mesmo quando o mosquito ou sapo sobe!
      const alturaDoChao = Math.max(0, visao.raiz.position.y);
      visao.sombra.position.y = -alturaDoChao + 0.02;
      const escalaSombra = Math.max(0.35, 1.35 - alturaDoChao * 0.35);
      visao.sombra.scale.setScalar(escalaSombra);
      visao.sombra.visible = visao.estado !== 'morto';

      visao.criatura.animar(visao.estado, dt);
      visao.barra.atualizar(
        visao.hp,
        visao.hpMax,
        visao.estado === 'morto',
        EM_ALERTA.has(visao.estado),
      );
    }
  }

  alertaNaFrente(x: number, z: number, yaw: number, raio: number): boolean {
    const frenteX = Math.sin(yaw);
    const frenteZ = Math.cos(yaw);
    for (const visao of this.visoes.values()) {
      if (!ESCONDIVEIS.has(visao.estado)) continue;
      if (visao.raiz.position.y > 1.3) continue;
      const dx = visao.raiz.position.x - x;
      const dz = visao.raiz.position.z - z;
      const distancia = Math.hypot(dx, dz);
      if (distancia > raio || distancia < 1e-3) continue;
      if ((dx * frenteX + dz * frenteZ) / distancia > 0.35) return true;
    }
    return false;
  }

  /**
   * Soft Lock-On estilo Genshin Impact:
   * Encontra o inimigo vivo mais próximo dentro de `raioMax` para virar o golpe
   * automaticamente na direção dele, dando prioridade para quem está na direção da câmera.
   */
  /**
   * Soft Lock-On estilo Genshin Impact:
   * Só puxa a mira se o inimigo estiver dentro de um cone frontal/lateral (~110°)
   * da direção desejada, para nunca girar o personagem 180° contra a vontade do jogador.
   */
  alvoMaisProximo(
    x: number,
    z: number,
    yawPreferido: number,
    raioMax = 3.6,
  ): { x: number; z: number; yawParaEle: number; dist: number } | null {
    let melhor: { x: number; z: number; yawParaEle: number; dist: number } | null = null;
    let melhorScore = Infinity;

    const dirX = Math.sin(yawPreferido);
    const dirZ = Math.cos(yawPreferido);

    for (const visao of this.visoes.values()) {
      if (visao.estado === 'morto') continue;
      const pos = visao.raiz.position;
      const dx = pos.x - x;
      const dz = pos.z - z;
      const dist = Math.hypot(dx, dz);
      if (dist > raioMax || dist < 0.001) continue;

      const dot = (dx / dist) * dirX + (dz / dist) * dirZ;
      // Se o inimigo estiver atrás da direção desejada (dot < -0.15), NÃO trava nele!
      if (dot < -0.15) continue;

      const penalidadeAngulo = (1 - dot) * 1.2;
      const score = dist + penalidadeAngulo;

      if (score < melhorScore) {
        melhorScore = score;
        melhor = {
          x: pos.x,
          z: pos.z,
          yawParaEle: Math.atan2(dx, dz),
          dist,
        };
      }
    }
    return melhor;
  }

  acertar(id: string): void {
    this.visoes.get(id)?.criatura.acertar();
  }

  posicaoDe(id: string): THREE.Vector3 | undefined {
    const raiz = this.visoes.get(id)?.raiz;
    return raiz ? raiz.position.clone() : undefined;
  }
}
