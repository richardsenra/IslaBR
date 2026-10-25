import * as THREE from 'three';
import type { AttackKind } from '@islabr/shared';

interface Vivo {
  readonly raiz: THREE.Group;
  readonly malha: THREE.Mesh;
  readonly uniforms: {
    uProgress: { value: number };
    uColor: { value: THREE.Color };
    uIsRing: { value: number };
  };
  idade: number;
  readonly vida: number;
  readonly de: number;
  readonly ate: number;
  readonly varrida: number;
}

const COR: Readonly<Record<AttackKind, THREE.Color>> = {
  attack1: new THREE.Color('#7dd3fc'), // Azul ciano vibrante nas bordas
  attack2: new THREE.Color('#7dd3fc'),
  attack3: new THREE.Color('#fde047'), // Amarelo ouro
  charged: new THREE.Color('#fb923c'), // Laranja fogo intenso
};

const ALTURA = 1.05;
const A_FRENTE = 0.85; // Mais perto do pivô do corpo para o arco envolver o personagem

// ============================================================================
// SHADERS: Rastro com ponta afiada, núcleo branco quente e cauda que dissolve
// ============================================================================
const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uProgress;
  uniform vec3 uColor;
  uniform float uIsRing;
  varying vec2 vUv;

  void main() {
    // Modo 1: Onda de choque circular no chão (charged)
    if (uIsRing > 0.5) {
      // Borda externa nítida e interior suave
      float radial = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
      float fade = pow(1.0 - uProgress, 1.8);
      vec3 col = mix(uColor, vec3(1.0), radial * 0.6);
      gl_FragColor = vec4(col, radial * fade * 0.9);
      return;
    }

    // Modo 2: Rastro de corte (Slash)
    // vUv.x = 0 (cauda) -> 1 (cabeça/lâmina)
    // vUv.y = 0 (borda interna) -> 1 (fio externo da lâmina)

    // A cabeça avança rápido no início; a cauda persegue logo atrás
    float head = smoothstep(0.0, 0.22, uProgress);
    float tail = smoothstep(0.08, 0.95, uProgress);

    // Máscara longitudinal ao longo do arco
    float headEdge = 1.0 - smoothstep(head - 0.08, head + 0.02, vUv.x);
    float tailEdge = smoothstep(tail - 0.15, tail + 0.25, vUv.x);
    float alongArc = headEdge * tailEdge;

    // Formato de meia-lua: afina as duas pontas para não ficar quadrado
    float tipTaper = sin(vUv.x * 3.14159265);

    // Fio da lâmina: mais forte perto da borda externa (vUv.y ~ 0.8)
    float bladeProfile = smoothstep(0.0, 0.65, vUv.y) * smoothstep(1.0, 0.82, vUv.y);

    // Núcleo incandescente (branco puro na crista e na ponta do golpe)
    float hotCore = pow(bladeProfile, 2.5) * smoothstep(0.3, 0.9, vUv.x);
    vec3 finalColor = mix(uColor, vec3(1.0, 1.0, 1.0), hotCore * 0.85);

    float fadeOut = 1.0 - pow(uProgress, 2.2);
    float alpha = alongArc * bladeProfile * tipTaper * fadeOut;

    if (alpha < 0.01) discard;
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

export class Rastros {
  readonly group = new THREE.Group();
  private readonly vivos: Vivo[] = [];

  // Geometrias compartilhadas na GPU (Zero alocação durante a luta)
  private readonly geoSlash: THREE.BufferGeometry;
  private readonly geoOnda: THREE.BufferGeometry;

  // Vetores temporários reutilizáveis para evitar Garbage Collection
  private readonly _frente = new THREE.Vector3();
  private readonly _centro = new THREE.Vector3();

  constructor() {
    this.group.name = 'rastros';
    this.geoSlash = this.criarGeometriaCrescente(1.25, 0.65, Math.PI * 1.15, 40);
    this.geoOnda = new THREE.RingGeometry(0.65, 1.15, 48);
  }

  /**
   * Constrói um arco no plano XZ cuja espessura começa em 0,
   * atinge o máximo no meio do golpe e volta a 0 na ponta.
   */
  private criarGeometriaCrescente(
    raioExterno: number,
    larguraMax: number,
    arcoTotal: number,
    segmentos: number,
  ): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const anguloInicial = -arcoTotal * 0.5;

    for (let i = 0; i <= segmentos; i++) {
      const u = i / segmentos; // 0 = cauda, 1 = cabeça da lâmina
      const angulo = anguloInicial + u * arcoTotal;

      // Curva em sino assimétrica: engrossa perto da ponta e afina na cauda
      const perfilEspessura = Math.sin(u * Math.PI) * (0.6 + 0.4 * u);
      const raioInterno = raioExterno - larguraMax * perfilEspessura;

      const cos = Math.cos(angulo);
      const sin = Math.sin(angulo);

      // Vértice interno (vUv.y = 0) e externo (vUv.y = 1) no plano XZ
      // Angulo 0 aponta para +Z (frente local do personagem)
      vertices.push(sin * raioInterno, 0, cos * raioInterno);
      uvs.push(u, 0);

      vertices.push(sin * raioExterno, 0, cos * raioExterno);
      uvs.push(u, 1);

      if (i < segmentos) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2);
        indices.push(base + 1, base + 3, base + 2);
      }
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    return geo;
  }

  golpe(tipo: AttackKind, x: number, y: number, z: number, yaw: number): void {
    this._frente.set(Math.sin(yaw), 0, Math.cos(yaw));
    this._centro.set(x, y + ALTURA, z).addScaledVector(this._frente, A_FRENTE);

    switch (tipo) {
      case 'attack1':
        // Corte diagonal: inclinado em Z (roll) descendo da direita para a esquerda
        this.spawnSlash(tipo, this._centro, yaw, {
          roll: -0.65,
          pitch: 0.15,
          escala: 1.05,
          vida: 0.22,
          varrida: 4.5,
        });
        return;

      case 'attack2':
        // Varrida horizontal reversa: gira no sentido oposto (escala X negativa inverte o sentido do arco)
        this.spawnSlash(tipo, this._centro, yaw, {
          roll: 0.12,
          pitch: 0,
          escala: 1.15,
          inverterSentido: true,
          vida: 0.22,
          varrida: -5.0,
        });
        return;

      case 'attack3':
        // Golpe vertical de cima para baixo (Overhead):
        // roll de 90° coloca o arco em pé no plano YZ, cortando o chão à frente
        this.spawnSlash(tipo, this._centro, yaw, {
          roll: Math.PI * 0.48,
          pitch: -0.25,
          escala: 1.4,
          vida: 0.26,
          varrida: 5.5,
        });
        return;

      case 'charged': {
        // Fecho da rajada: o corte vertical e a onda de choque em 360° no chão.
        // Os dois primeiros cortes saem durante a rajada, em attack1 e attack2.
        this.spawnSlash('charged', this._centro, yaw, {
          roll: Math.PI * 0.5,
          pitch: -0.2,
          escala: 1.85,
          vida: 0.34,
          varrida: 6.5,
        });

        const chao = this._centro
          .clone()
          .setY(y + 0.06)
          .addScaledVector(this._frente, -0.5);
        this.spawnOnda('charged', chao);
        return;
      }
    }
  }

  update(dt: number): void {
    for (let i = this.vivos.length - 1; i >= 0; i -= 1) {
      const vivo = this.vivos[i];
      if (!vivo) continue;

      vivo.idade += dt;
      const t = vivo.idade / vivo.vida;

      if (t >= 1) {
        this.remover(i);
        continue;
      }

      // Ease-out exponencial agressivo: explode no frame 1 e desacelera no ar
      const easeOut = 1 - Math.pow(1 - t, 3);
      const escalaAtual = vivo.de + (vivo.ate - vivo.de) * easeOut;

      // Mantém o flip caso o golpe seja invertido no eixo X
      const sinalX = Math.sign(vivo.raiz.scale.x) || 1;
      vivo.raiz.scale.set(escalaAtual * sinalX, escalaAtual, escalaAtual);

      // Gira o arco no próprio plano da lâmina (eixo Y da malha local)
      vivo.malha.rotation.y += vivo.varrida * (1 - t) * dt;
      vivo.uniforms.uProgress.value = t;
    }
  }

  private spawnSlash(
    tipo: AttackKind,
    centro: THREE.Vector3,
    yaw: number,
    cfg: {
      roll: number;
      pitch: number;
      escala: number;
      vida: number;
      varrida: number;
      inverterSentido?: boolean;
    },
  ): void {
    const { raiz, malha, uniforms } = this.criarInstancia(tipo, this.geoSlash, false);
    raiz.position.copy(centro);
    raiz.rotation.order = 'YXZ';
    raiz.rotation.y = yaw;
    raiz.rotation.x = cfg.pitch;
    raiz.rotation.z = cfg.roll;

    if (cfg.inverterSentido) {
      raiz.scale.x = -1;
    }

    this.registrar({
      raiz,
      malha,
      uniforms,
      idade: 0,
      vida: cfg.vida,
      de: cfg.escala * 0.75,
      ate: cfg.escala * 1.2,
      varrida: cfg.varrida,
    });
  }

  private spawnOnda(tipo: AttackKind, chao: THREE.Vector3): void {
    const { raiz, malha, uniforms } = this.criarInstancia(tipo, this.geoOnda, true);
    raiz.position.copy(chao);
    malha.rotation.x = -Math.PI / 2;

    this.registrar({
      raiz,
      malha,
      uniforms,
      idade: 0,
      vida: 0.42,
      de: 0.35,
      ate: 2.9,
      varrida: 0,
    });
  }

  private criarInstancia(
    tipo: AttackKind,
    geometria: THREE.BufferGeometry,
    isRing: boolean,
  ): {
    raiz: THREE.Group;
    malha: THREE.Mesh;
    uniforms: Vivo['uniforms'];
  } {
    const uniforms = {
      uProgress: { value: 0 },
      uColor: { value: COR[tipo] },
      uIsRing: { value: isRing ? 1.0 : 0.0 },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

    const malha = new THREE.Mesh(geometria, material);
    const raiz = new THREE.Group();
    raiz.add(malha);
    return { raiz, malha, uniforms };
  }

  private registrar(vivo: Vivo): void {
    this.group.add(vivo.raiz);
    this.vivos.push(vivo);
  }

  private remover(indice: number): void {
    const [vivo] = this.vivos.splice(indice, 1);
    if (!vivo) return;
    this.group.remove(vivo.raiz);
    // Não damos dispose na geometria porque ela é compartilhada por todos os golpes!
    (vivo.malha.material as THREE.Material).dispose();
  }
}
