import * as THREE from 'three';

export interface Stage {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
}

/**
 * Cena base. Uma luz direcional e uma hemisférica: o toon shading com contorno
 * e a luz baked da SPEC §10 ficam para o M6.
 */
export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#87ceeb');
  scene.fog = new THREE.Fog('#87ceeb', 60, 150);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);

  scene.add(new THREE.HemisphereLight('#ffffff', '#5a8f3c', 1.1));
  const sun = new THREE.DirectionalLight('#fff6e0', 1.4);
  sun.position.set(12, 20, 8);
  scene.add(sun);

  const resize = (): void => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  return { scene, camera, renderer };
}
