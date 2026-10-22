/**
 * Teclado e mouse. WASD anda, espaço pula, Shift esquiva (SPEC §6).
 * O mouse gira a câmera; clicar no canvas captura o ponteiro.
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

export class InputReader {
  private readonly pressed = new Set<string>();
  /** Teclas apertadas desde a última leitura, para pulo e esquiva num toque. */
  private readonly tapped = new Set<string>();
  private lookYaw = 0;
  private lookPitch = 0;
  private lookZoom = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('wheel', this.onWheel);
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

  private consume(code: string): boolean {
    return this.tapped.delete(code);
  }

  /** Consome o movimento acumulado do mouse. */
  readLook(): LookDelta {
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
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
  };

  private readonly onBlur = (): void => {
    this.pressed.clear();
    this.tapped.clear();
  };

  private readonly onMouseDown = (): void => {
    if (document.pointerLockElement !== this.canvas) {
      void this.canvas.requestPointerLock();
    }
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (document.pointerLockElement !== this.canvas) return;
    // Mouse para a direita gira a vista para a direita, que é -X no mundo.
    this.lookYaw -= event.movementX * MOUSE_SENSITIVITY;
    this.lookPitch += event.movementY * MOUSE_SENSITIVITY;
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.lookZoom += event.deltaY * WHEEL_SENSITIVITY;
  };
}
