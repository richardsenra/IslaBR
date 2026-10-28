import * as THREE from 'three';
import { content } from '@islabr/content';
import type { BossPayload } from '@islabr/shared';

/**
 * A caverna do Tentáculo (SPEC §7.1, z6): a água que alaga as salas internas
 * até a m11, o tentáculo gigante que passou pelo corredor (m12) e a maré da
 * sala do chefe, que sobe na fase 2. Só desenho; o que vale é o servidor.
 */
export class Caverna {
  readonly group = new THREE.Group();

  private readonly alagado: THREE.Mesh;
  private readonly mare: THREE.Mesh;
  private aguaAtual = 0;
  private aguaAlvo = 0;

  constructor() {
    this.group.name = 'caverna';
    const agua = new THREE.MeshLambertMaterial({
      color: '#2a8fd0',
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });

    // As salas internas, alagadas até as comportas serem abertas.
    this.alagado = new THREE.Mesh(new THREE.BoxGeometry(18, 1.2, 18), agua);
    this.alagado.position.set(-25, 0.45, -39);
    this.group.add(this.alagado);

    // A maré do chefe: um bloco de água que sobe do chão da sala.
    const sala = content.world.guardiao.sala;
    this.mare = new THREE.Mesh(
      new THREE.BoxGeometry(sala.maxX - sala.minX, 1, sala.maxZ - sala.minZ),
      agua,
    );
    this.mare.position.set((sala.minX + sala.maxX) / 2, -0.5, (sala.minZ + sala.maxZ) / 2);
    this.group.add(this.mare);

    this.group.add(this.criarTentaculoGigante());
  }

  /** Um tubo roxo com ventosas pelo trajeto do tentáculo (m12). */
  private criarTentaculoGigante(): THREE.Group {
    const grupo = new THREE.Group();
    const pontos = content.world.trajeto_tentaculo.map((p) => new THREE.Vector3(p.x, 0.7, p.z));
    const curva = new THREE.CatmullRomCurve3(pontos);
    const pele = new THREE.MeshLambertMaterial({ color: '#8d4bb8' });
    grupo.add(new THREE.Mesh(new THREE.TubeGeometry(curva, 40, 0.8, 10), pele));

    const ventosa = new THREE.MeshLambertMaterial({ color: '#e8b7f0' });
    const geometria = new THREE.CylinderGeometry(0.28, 0.28, 0.06, 12);
    for (let i = 0; i < 10; i += 1) {
      const ponto = curva.getPointAt(i / 9);
      const lado = i % 2 === 0 ? 1 : -1;
      const disco = new THREE.Mesh(geometria, ventosa);
      disco.position.set(ponto.x + lado * 0.8, 0.55, ponto.z);
      disco.rotation.z = Math.PI / 2;
      grupo.add(disco);
    }
    return grupo;
  }

  /** Abre as salas internas: a água baixou. */
  definirAbertas(abertas: ReadonlySet<string>): void {
    this.alagado.visible = !abertas.has('salas_internas');
  }

  /** Chegou o estado da luta: a maré vai para o nível novo. */
  aoReceberLuta(luta: BossPayload): void {
    this.aguaAlvo = luta.agua;
  }

  update(dt: number): void {
    const falta = this.aguaAlvo - this.aguaAtual;
    this.aguaAtual += Math.sign(falta) * Math.min(Math.abs(falta), dt * 0.4);
    // O bloco tem 1 m de altura: o topo fica na altura da maré.
    this.mare.position.y = this.aguaAtual - 0.5;
    this.mare.visible = this.aguaAtual > 0.02;
  }
}
