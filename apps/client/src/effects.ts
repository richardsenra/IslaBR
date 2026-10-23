import * as THREE from 'three';
import { HIT_STOP_MS } from '@islabr/shared';

/**
 * Feedback do combate (SPEC §6): hit-stop de 60 ms, tremor curto de câmera e
 * números de dano flutuantes. Nada disso decide coisa alguma: o dano já veio
 * decidido do servidor, aqui só se dá peso para quem está jogando.
 */

export type TipoDeNumero = 'inimigo' | 'jogador' | 'neutro' | 'carregado';

interface Numero {
  readonly el: HTMLElement;
  readonly mundo: THREE.Vector3;
  idade: number;
  /** Deriva lateral, para números seguidos não se empilharem. */
  readonly deriva: number;
}

/** Quanto o número fica na tela, em segundos. */
const VIDA_DO_NUMERO = 0.9;
/** Quanto ele sobe, em pixels, até sumir. */
const SUBIDA_PX = 56;

const ALTURA_INICIAL = 1.4;

const vetor = new THREE.Vector3();

export class Effects {
  private readonly numeros: Numero[] = [];
  private congeladoAte = 0;
  private tremorRestante = 0;
  private tremorTotal = 0;
  private tremorAmplitude = 0;
  private piscandoAte = 0;

  constructor(
    private readonly camada: HTMLElement,
    private readonly vermelho: HTMLElement,
  ) {}

  /** Número flutuante na posição do mundo (por exemplo, a cabeça do alvo). */
  numero(posicao: THREE.Vector3, texto: string, tipo: TipoDeNumero): void {
    const el = document.createElement('div');
    el.className = `numero numero-${tipo}`;
    el.textContent = texto;
    this.camada.appendChild(el);
    this.numeros.push({
      el,
      mundo: posicao.clone().add(new THREE.Vector3(0, ALTURA_INICIAL, 0)),
      idade: 0,
      deriva: (Math.random() - 0.5) * 36,
    });
  }

  /** Congela as animações por um instante, no momento do acerto. */
  congelar(agoraMs: number, ms = HIT_STOP_MS): void {
    this.congeladoAte = Math.max(this.congeladoAte, agoraMs + ms);
  }

  congelado(agoraMs: number): boolean {
    return agoraMs < this.congeladoAte;
  }

  /** Tremor curto de câmera; `amplitude` em metros. */
  tremer(amplitude: number, segundos = 0.14): void {
    this.tremorAmplitude = Math.max(this.tremorAmplitude, amplitude);
    this.tremorTotal = Math.max(this.tremorTotal, segundos);
    this.tremorRestante = Math.max(this.tremorRestante, segundos);
  }

  /** A tela fica vermelha por um instante quando o jogador apanha. */
  piscarVermelho(agoraMs: number, ms = 220): void {
    this.piscandoAte = agoraMs + ms;
    this.vermelho.style.opacity = '1';
  }

  /** Aplica o tremor na câmera, depois de ela ter sido posicionada. */
  tremerCamera(camera: THREE.Camera, dt: number): void {
    if (this.tremorRestante <= 0) {
      this.tremorAmplitude = 0;
      this.tremorTotal = 0;
      return;
    }
    this.tremorRestante = Math.max(0, this.tremorRestante - dt);
    // Decai até zero, para o tremor acabar sem trancos.
    const forca = this.tremorTotal > 0 ? this.tremorRestante / this.tremorTotal : 0;
    const amplitude = this.tremorAmplitude * forca;
    camera.position.x += (Math.random() - 0.5) * 2 * amplitude;
    camera.position.y += (Math.random() - 0.5) * 2 * amplitude;
    camera.position.z += (Math.random() - 0.5) * 2 * amplitude;
  }

  /** Move os números pela tela e apaga os que acabaram. */
  update(dt: number, agoraMs: number, camera: THREE.Camera, canvas: HTMLCanvasElement): void {
    if (agoraMs >= this.piscandoAte) this.vermelho.style.opacity = '0';

    const largura = canvas.clientWidth;
    const altura = canvas.clientHeight;

    for (let i = this.numeros.length - 1; i >= 0; i -= 1) {
      const numero = this.numeros[i];
      if (!numero) continue;
      numero.idade += dt;

      if (numero.idade >= VIDA_DO_NUMERO) {
        numero.el.remove();
        this.numeros.splice(i, 1);
        continue;
      }

      vetor.copy(numero.mundo).project(camera);
      // Atrás da câmera não aparece, em vez de espelhar do outro lado.
      if (vetor.z > 1) {
        numero.el.style.opacity = '0';
        continue;
      }

      const t = numero.idade / VIDA_DO_NUMERO;
      const x = (vetor.x * 0.5 + 0.5) * largura + numero.deriva * t;
      const y = (-vetor.y * 0.5 + 0.5) * altura - SUBIDA_PX * t;
      // Cresce no impacto e some no fim.
      const escala = t < 0.12 ? 0.7 + (t / 0.12) * 0.55 : 1.25 - t * 0.25;
      numero.el.style.opacity = String(t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4);
      numero.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${escala})`;
    }
  }
}
