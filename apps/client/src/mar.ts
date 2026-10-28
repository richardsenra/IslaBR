import * as THREE from 'three';
import { ARENA_LIMITE } from '@islabr/shared';

/**
 * O mar em volta da ilha: um plano só, um desenho (SPEC §10), sem textura.
 * Tudo sai do shader: cor por distância da costa, células de espuma que
 * andam no tempo, faixa de espuma na beira e ondulação nos vértices.
 *
 * A ilha é um quadrado de lado 2 × ARENA_LIMITE, então a "distância da costa"
 * é a distância de Chebyshev ao quadrado. O limite físico do mundo são os
 * muros invisíveis de world.json; o mar é só o que se vê depois deles.
 */

const TAMANHO = 600; // 6× o lado da ilha; o fog esconde a borda muito antes
const SEGMENTOS = 48; // 48 × 48 × 2 = 4608 triângulos
const NIVEL = -0.5; // abaixo do chão (y = 0) com folga para a crista da onda (até +0,33)

const VERTICE = /* glsl */ `
  #include <fog_pars_vertex>
  uniform float uTime;
  varying vec2 vMundo;

  void main() {
    vec3 p = position;
    // O plano gira -90° em X: o z local vira a altura no mundo.
    vec2 w = (modelMatrix * vec4(p, 1.0)).xz;
    p.z += 0.14 * (sin(w.x * 0.11 + uTime * 0.9) + cos(w.y * 0.09 + uTime * 0.7))
         + 0.05 * sin((w.x + w.y) * 0.31 + uTime * 1.7);
    vMundo = w;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAGMENTO = /* glsl */ `
  #include <fog_pars_fragment>
  uniform float uTime;
  uniform float uIsla;
  uniform vec3 uRaso;
  uniform vec3 uFundo;
  varying vec2 vMundo;

  void main() {
    // Distância até a costa quadrada (0 na beira da ilha, cresce para fora).
    float d = max(max(abs(vMundo.x), abs(vMundo.y)) - uIsla, 0.0);

    // Turquesa na beira, azul-oceano lá longe.
    vec3 cor = mix(uRaso, uFundo, smoothstep(0.0, 70.0, d));

    // Células de espuma: duas ondas cruzadas, com o limiar alto para sobrar
    // só as cristas, que se movem devagar.
    float v = sin(vMundo.x * 0.42 + uTime * 0.55) * sin(vMundo.y * 0.38 - uTime * 0.45)
            + 0.6 * sin((vMundo.x + vMundo.y) * 0.27 + uTime * 0.35);
    float celulas = smoothstep(1.0, 1.25, v) * (1.0 - smoothstep(10.0, 60.0, d)) * 0.28;

    // Espuma na costa: faixa que ondula ao longo da beira e vai e volta.
    float beira = vMundo.x + vMundo.y;
    float vai = 1.6 + 0.5 * sin(uTime * 1.3) + 0.35 * sin(beira * 0.7 + uTime * 1.9);
    float faixa = 1.0 - smoothstep(vai - 0.5, vai, d);
    float marola = smoothstep(0.55, 0.8, sin(d * 1.8 - uTime * 1.6))
                 * (1.0 - smoothstep(1.5, 5.0, d)) * 0.55;

    float espuma = clamp(max(faixa, marola) + celulas, 0.0, 1.0);
    gl_FragColor = vec4(mix(cor, vec3(0.96, 0.99, 1.0), espuma), 1.0);
    #include <fog_fragment>
  }
`;

export interface Mar {
  readonly malha: THREE.Mesh;
  /** Avança a animação; `segundos` é o tempo corrido do jogo. */
  update(segundos: number): void;
}

export function criarMar(): Mar {
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uIsla: { value: ARENA_LIMITE },
        uRaso: { value: new THREE.Color('#2fd4c8') },
        uFundo: { value: new THREE.Color('#1a5fb4') },
      },
    ]),
    vertexShader: VERTICE,
    fragmentShader: FRAGMENTO,
    fog: true,
  });

  // O merge clona os uniforms: o tempo tem de vir do material, não do objeto passado.
  const tempo = material.uniforms['uTime'] as THREE.IUniform<number>;

  const malha = new THREE.Mesh(
    new THREE.PlaneGeometry(TAMANHO, TAMANHO, SEGMENTOS, SEGMENTOS),
    material,
  );
  malha.name = 'mar';
  malha.rotation.x = -Math.PI / 2;
  malha.position.y = NIVEL;
  malha.castShadow = false;
  malha.receiveShadow = false;
  // A ondulação é pequena e o plano sempre cobre a tela: não vale testar o frustum.
  malha.frustumCulled = false;

  return {
    malha,
    update(segundos) {
      tempo.value = segundos;
    },
  };
}
