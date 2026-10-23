import * as THREE from 'three';
import { SnapshotBuffer } from '@islabr/shared';
import type { NetEnemy } from './network.js';

/**
 * Inimigos desenhados (SPEC §6, M3). O estado — posição, vida, o que está
 * fazendo — vem do servidor; aqui só se interpola e se anima. Placeholder de
 * primitivas, como o resto: não há caranguejo nos assets CC0 que temos.
 */

const COR_COMUM = '#e4572e';
const COR_ESPINHOSO = '#6d2e2a';
const COR_ESPINHO = '#f2c14e';

/** Quanto tempo o corpo leva para sumir depois de morrer. */
const MORTE_SEGUNDOS = 0.45;
/** Quanto tempo o brilho de "levei golpe" dura. */
const FLASH_SEGUNDOS = 0.14;

interface Garra {
  readonly pivo: THREE.Group;
  readonly lado: 1 | -1;
}

/** Um caranguejo: corpo, olhos, garras, pernas e (se for o espinhoso) espinhos. */
class Caranguejo {
  readonly raiz = new THREE.Group();

  private readonly corpo = new THREE.Group();
  private readonly pernas: THREE.Mesh[] = [];
  private readonly garras: Garra[] = [];
  private readonly materiais: THREE.MeshLambertMaterial[] = [];
  private fase = Math.random() * Math.PI * 2;
  private flash = 0;
  private morte = 0;

  constructor(espinhoso: boolean) {
    const cor = espinhoso ? COR_ESPINHOSO : COR_COMUM;
    const casco = this.material(cor);
    const claro = this.material(espinhoso ? '#8a403a' : '#f08a5d');
    const branco = this.material('#ffffff');
    const pupila = this.material('#22222c');

    const tronco = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 12), casco);
    tronco.scale.set(1.15, 0.6, 0.85);
    tronco.position.y = 0.34;
    this.corpo.add(tronco);

    // Olhos em haste, espiando para a frente (+Z).
    for (const lado of [-1, 1] as const) {
      const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 6), claro);
      haste.position.set(lado * 0.18, 0.66, 0.32);
      const olho = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), branco);
      olho.position.set(lado * 0.18, 0.78, 0.34);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), pupila);
      iris.position.set(lado * 0.18, 0.78, 0.4);
      this.corpo.add(haste, olho, iris);
    }

    // Garras: um braço curto e a pinça, que estala quando ele ataca.
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

    // Seis pernas finas, três de cada lado.
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

    this.raiz.add(this.corpo);
  }

  private material(cor: string): THREE.MeshLambertMaterial {
    const material = new THREE.MeshLambertMaterial({ color: cor });
    this.materiais.push(material);
    return material;
  }

  /** Acende o corpo por um instante: o jeito de dizer "isso acertou". */
  acertar(): void {
    this.flash = FLASH_SEGUNDOS;
  }

  reviver(): void {
    this.morte = 0;
    this.flash = 0;
    this.raiz.visible = true;
    this.corpo.rotation.z = 0;
    this.corpo.position.y = 0;
    this.corpo.scale.setScalar(1);
  }

  /** Avança a animação do estado que o servidor mandou. */
  animar(estado: string, dt: number): void {
    // O brilho de dano decai rápido.
    this.flash = Math.max(0, this.flash - dt);
    const brilho = this.flash > 0 ? this.flash / FLASH_SEGUNDOS : 0;
    for (const material of this.materiais) material.emissive.setScalar(brilho * 0.85);

    if (estado === 'morto') {
      this.morte += dt;
      const t = Math.min(this.morte / MORTE_SEGUNDOS, 1);
      // Vira de barriga para cima e encolhe.
      this.corpo.rotation.z = t * Math.PI;
      this.corpo.position.y = t * 0.25;
      this.corpo.scale.setScalar(Math.max(1 - t * t, 0.001));
      this.raiz.visible = t < 1;
      return;
    }

    const correndo = estado === 'perseguindo';
    const atacando = estado === 'atacando';
    this.fase += dt * (correndo ? 16 : atacando ? 9 : 2);

    // Anda de lado: o corpo balança e as pernas vão e voltam.
    this.corpo.position.x = correndo ? Math.sin(this.fase * 0.5) * 0.04 : 0;
    this.corpo.position.y = correndo ? Math.abs(Math.sin(this.fase)) * 0.05 : 0;
    this.pernas.forEach((perna, indice) => {
      const lado = indice < 3 ? -1 : 1;
      const base = lado * -0.45;
      perna.rotation.z = base + (correndo ? Math.sin(this.fase + indice * 1.3) * 0.35 : 0);
    });

    // As garras estalam quando ele ataca; paradas, ficam relaxadas.
    for (const { pivo, lado } of this.garras) {
      const estalo = atacando ? Math.max(0, Math.sin(this.fase)) * 0.7 : 0;
      pivo.rotation.y = lado * (0.15 + estalo);
      pivo.rotation.x = atacando ? -0.35 * Math.max(0, Math.sin(this.fase)) : 0;
    }

    // Levou golpe: encolhe de susto.
    const susto = estado === 'ferido' ? 0.85 : 1;
    this.corpo.scale.set(1, susto, 1);
  }

  descartar(): void {
    this.raiz.traverse((objeto) => {
      if (objeto instanceof THREE.Mesh) objeto.geometry.dispose();
    });
    for (const material of this.materiais) material.dispose();
  }
}

/** Barra de vida flutuando sobre o inimigo; só aparece depois do primeiro golpe. */
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
    // Aparece machucado ou quando o bicho já percebeu o jogador. Bicho manso e
    // inteiro não precisa de barra; o que está na briga precisa, porque o corpo
    // do jogador pode escondê-lo da câmera.
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
  readonly caranguejo: Caranguejo;
  readonly barra: BarraDeVida;
  readonly raiz: THREE.Group;
  buffer: SnapshotBuffer;
  estado: string;
  hp: number;
  hpMax: number;
  tipo: string;
}

/** Todos os inimigos da sala, desenhados e interpolados. */
export class Enemies {
  readonly group = new THREE.Group();

  private readonly visoes = new Map<string, Visao>();

  constructor() {
    this.group.name = 'inimigos';
  }

  /** Recebe o estado do servidor: cria quem apareceu e guarda a posição nova. */
  sync(inimigos: readonly NetEnemy[], chegouEm: number): void {
    const presentes = new Set<string>();

    for (const dado of inimigos) {
      presentes.add(dado.id);
      let visao = this.visoes.get(dado.id);

      if (!visao) {
        const caranguejo = new Caranguejo(dado.tipo === 'e02');
        const barra = new BarraDeVida();
        const raiz = new THREE.Group();
        raiz.add(caranguejo.raiz, barra.sprite);
        barra.sprite.position.y = dado.tipo === 'e02' ? 1.9 : 1.55;
        this.group.add(raiz);
        visao = {
          caranguejo,
          barra,
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

      // Voltou a viver: nasce no posto, sem deslizar do lugar onde morreu.
      if (visao.estado === 'morto' && dado.estado !== 'morto') {
        visao.caranguejo.reviver();
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
      visao.caranguejo.descartar();
      visao.barra.descartar();
      this.visoes.delete(id);
    }
  }

  /** Interpola posição e anima. `agora` é o relógio do laço de render. */
  update(agora: number, dt: number): void {
    for (const visao of this.visoes.values()) {
      if (visao.estado !== 'morto') {
        const pose = visao.buffer.sample(agora);
        if (pose) {
          visao.raiz.position.set(pose.x, pose.y, pose.z);
          visao.raiz.rotation.y = pose.yaw;
        }
      }
      visao.caranguejo.animar(visao.estado, dt);
      const alerta =
        visao.estado === 'perseguindo' || visao.estado === 'atacando' || visao.estado === 'ferido';
      visao.barra.atualizar(visao.hp, visao.hpMax, visao.estado === 'morto', alerta);
    }
  }

  /**
   * Tem inimigo alerta (perseguindo, atacando ou ferido) à frente do jogador,
   * perto o bastante para o corpo dele o esconder da câmera? `yaw` é para onde
   * a câmera olha, que é onde o jogador ataca.
   */
  alertaNaFrente(x: number, z: number, yaw: number, raio: number): boolean {
    const frenteX = Math.sin(yaw);
    const frenteZ = Math.cos(yaw);
    for (const visao of this.visoes.values()) {
      if (
        visao.estado !== 'perseguindo' &&
        visao.estado !== 'atacando' &&
        visao.estado !== 'ferido'
      ) {
        continue;
      }
      const dx = visao.raiz.position.x - x;
      const dz = visao.raiz.position.z - z;
      const distancia = Math.hypot(dx, dz);
      if (distancia > raio || distancia < 1e-3) continue;
      // Só quem está na frente é escondido; quem está atrás não precisa de fade.
      if ((dx * frenteX + dz * frenteZ) / distancia > 0.35) return true;
    }
    return false;
  }

  /** Brilha o inimigo que levou o golpe. */
  acertar(id: string): void {
    this.visoes.get(id)?.caranguejo.acertar();
  }

  /** Onde o inimigo está agora, para colocar o número de dano em cima dele. */
  posicaoDe(id: string): THREE.Vector3 | undefined {
    const raiz = this.visoes.get(id)?.raiz;
    return raiz ? raiz.position.clone() : undefined;
  }
}
