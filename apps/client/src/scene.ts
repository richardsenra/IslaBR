import * as THREE from 'three';

export function createScene(canvas: HTMLCanvasElement): void {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#87ceeb');

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  camera.position.set(4, 4, 6);
  camera.lookAt(0, 0.5, 0);

  scene.add(new THREE.HemisphereLight('#ffffff', '#5a8f3c', 1.2));
  const sun = new THREE.DirectionalLight('#ffffff', 1.5);
  sun.position.set(5, 10, 4);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: '#7ccf5a' }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: '#ff8a3d' }),
  );
  cube.position.y = 0.5;
  scene.add(cube);

  const resize = (): void => {
    const { clientWidth: w, clientHeight: h } = canvas;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  renderer.setAnimationLoop((time) => {
    cube.rotation.y = time / 1000;
    renderer.render(scene, camera);
  });
}
