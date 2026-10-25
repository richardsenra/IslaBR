import { CHARGE_SECONDS } from '@islabr/shared';

/**
 * Teclado e mouse. WASD anda, espaço pula, Shift esquiva, botão esquerdo ou J
 * ataca (SPEC §6). O mouse gira a câmera; clicar no canvas captura o ponteiro.
 */
export interface InputAxes {
  /** Frente (+1) e trás (-1) em relação à câmera. */
  readonly forward: number;
  /** Direita (+1) e esquerda (-1) em relação à câmera. */
  readonly strafe: number;
}

/** Quanto o mouse girou desde a última leitura, em radianos. */
export interface LookDelta {
  readonly yaw: number;
  readonly pitch: number;
  readonly zoom: number;
}

const MOUSE_SENSITIVITY = 0.0025;
const WHEEL_SENSITIVITY = 0.004;
/** Giro da câmera com Q e E, em rad/s, para quem joga sem o mouse capturado. */
const KEY_TURN_SPEED = 2.2;

/** Tecla que ataca sem precisar do mouse capturado. */
const ATTACK_KEY = 'KeyJ';

/** Como o botão de ataque foi acionado: toque rápido ou segurado até carregar. */
export type AttackRelease = 'normal' | 'charged';

export class InputReader {
  private readonly pressed = new Set<string>();
  /** Teclas apertadas desde a última leitura, para pulo e esquiva num toque. */
  private readonly tapped = new Set<string>();
  private lookYaw = 0;
  private lookPitch = 0;
  private lookZoom = 0;
  private ultimaLeitura = performance.now();

  /** Instante em que o ataque começou a ser segurado, em ms. */
  private holdStart: number | null = null;
  /** Fila de cliques rápidos dados pelo jogador. */
  private queuedClicks = 0;
  /** Evita disparar mais de um charged no mesmo segurar de botão. */
  private chargedFired = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }

  /**
   * Consome um ataque da fila:
   * - Se o botão estiver segurado por >= CHARGE_SECONDS, devolve 'charged'.
   * - Se houver cliques na fila, devolve 'normal' (1 por chamada).
   */
  consumeAttack(): AttackRelease | null {
    if (this.holdStart !== null && !this.chargedFired) {
      const segundos = (performance.now() - this.holdStart) / 1000;
      if (segundos >= CHARGE_SECONDS) {
        this.chargedFired = true;
        this.queuedClicks = 0;
        return 'charged';
      }
    }

    if (this.queuedClicks > 0) {
      this.queuedClicks -= 1;
      return 'normal';
    }

    return null;
  }

  /** De 0 a 1 enquanto o ataque está sendo segurado; `null` se não está. */
  chargeProgress(): number | null {
    if (this.holdStart === null || this.chargedFired) return null;
    const segundos = (performance.now() - this.holdStart) / 1000;
    return Math.min(segundos / CHARGE_SECONDS, 1);
  }

  private beginAttack(): void {
    this.holdStart = performance.now();
    this.chargedFired = false;
    // Empilha o clique imediatamente (até 3 cliques para o combo completo)
    this.queuedClicks = Math.min(this.queuedClicks + 1, 3);
  }

  private endAttack(): void {
    if (this.holdStart === null) return;
    const segundos = (performance.now() - this.holdStart) / 1000;
    const jaSaiuCharged = this.chargedFired;
    this.holdStart = null;
    this.chargedFired = false;

    if (!jaSaiuCharged && segundos >= CHARGE_SECONDS) {
      this.queuedClicks = 0;
    }
  }

  readAxes(): InputAxes {
    const held = (...codes: readonly string[]): boolean => codes.some((c) => this.pressed.has(c));
    const forward = (held('KeyW', 'ArrowUp') ? 1 : 0) - (held('KeyS', 'ArrowDown') ? 1 : 0);
    const strafe = (held('KeyD', 'ArrowRight') ? 1 : 0) - (held('KeyA', 'ArrowLeft') ? 1 : 0);
    return { forward, strafe };
  }

  /** Pulo e esquiva valem por toque: segurar a tecla não repete a ação. */
  consumeJump(): boolean {
    return this.consume('Space');
  }

  consumeDodge(): boolean {
    return this.consume('ShiftLeft') || this.consume('ShiftRight');
  }

  /** I abre e fecha o inventário. */
  consumeInventory(): boolean {
    return this.consume('KeyI');
  }

  /** Tecla avulsa apertada desde a última leitura (os números do inventário). */
  consumeKey(code: string): boolean {
    return this.consume(code);
  }

  /** F interage com o alvo perto e avança a fala aberta (SPEC §6). */
  consumeInteract(): boolean {
    return this.consume('KeyF') || this.consume('Enter');
  }

  private consume(code: string): boolean {
    return this.tapped.delete(code);
  }

  /** Consome o movimento acumulado do mouse. */
  readLook(): LookDelta {
    const agora = performance.now();
    const dt = Math.min((agora - this.ultimaLeitura) / 1000, 0.1);
    this.ultimaLeitura = agora;
    const giro = (this.pressed.has('KeyQ') ? 1 : 0) - (this.pressed.has('KeyE') ? 1 : 0);
    this.lookYaw += giro * KEY_TURN_SPEED * dt;

    const delta = { yaw: this.lookYaw, pitch: this.lookPitch, zoom: this.lookZoom };
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.lookZoom = 0;
    return delta;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Space') event.preventDefault();
    if (!event.repeat) this.tapped.add(event.code);
    this.pressed.add(event.code);
    if (event.code === ATTACK_KEY && !event.repeat) this.beginAttack();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
    if (event.code === ATTACK_KEY) this.endAttack();
  };

  private readonly onBlur = (): void => {
    this.pressed.clear();
    this.tapped.clear();
    this.holdStart = null;
    this.queuedClicks = 0;
    this.chargedFired = false;
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (document.pointerLockElement !== this.canvas) {
      void this.canvas.requestPointerLock();
      return;
    }
    if (event.button === 0) this.beginAttack();
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) this.endAttack();
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (document.pointerLockElement !== this.canvas) return;
    this.lookYaw -= event.movementX * MOUSE_SENSITIVITY;
    this.lookPitch += event.movementY * MOUSE_SENSITIVITY;
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.lookZoom += event.deltaY * WHEEL_SENSITIVITY;
  };
}
