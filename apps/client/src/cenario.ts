import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { colocacoesDoCenario, type Colocacao } from '@islabr/shared';

/**
 * Cenário em modelos glTF dos pacotes Stylized Nature MegaKit e Medieval
 * Village MegaKit, da Quaternius (CC0; ver public/models/cenario/LICENSE.md).
 *
 * Cada modelo é carregado uma vez. O que está na ilha em muitas cópias (mato,
 * árvores da mata, caixas) vira uma malha instanciada por parte do modelo:
 * um desenho para todas as cópias, que é o que segura o orçamento da SPEC §10.
 * Aqui é só desenho; a colisão vem das peças de world.json.
 */

interface Parte {
  readonly geometria: THREE.BufferGeometry;
  readonly material: THREE.Material;
}

const loader = new GLTFLoader();
const modelos = new Map<string, readonly Parte[]>();

function baseUrl(nome: string): string {
  return `${import.meta.env.BASE_URL}models/cenario/${nome}.gltf`;
}

/** Carrega um modelo e guarda suas partes, já na posição do arquivo. */
async function carregar(nome: string): Promise<void> {
  if (modelos.has(nome)) return;
  const gltf = await loader.loadAsync(baseUrl(nome));
  gltf.scene.updateMatrixWorld(true);
  const partes: Parte[] = [];
  gltf.scene.traverse((objeto) => {
    if (!(objeto instanceof THREE.Mesh)) return;
    const geometria = (objeto.geometry as THREE.BufferGeometry).clone();
    geometria.applyMatrix4(objeto.matrixWorld);
    const materiais: THREE.Material[] = Array.isArray(objeto.material)
      ? objeto.material
      : [objeto.material as THREE.Material];
    for (const material of materiais) {
      // O brilho do PBR some no estilo cartoon; o cenário não reflete nada.
      if (material instanceof THREE.MeshStandardMaterial) {
        material.metalness = 0;
        material.roughness = 1;
      }
    }
    // Um mesh com vários materiais vira uma parte por grupo.
    if (Array.isArray(objeto.material) && geometria.groups.length > 0) {
      for (const grupo of geometria.groups) {
        const material = materiais[grupo.materialIndex ?? 0];
        if (!material) continue;
        const parte = new THREE.BufferGeometry();
        for (const [chave, atributo] of Object.entries(geometria.attributes)) {
          parte.setAttribute(chave, atributo);
        }
        const indice = geometria.index;
        if (indice)
          parte.setIndex(Array.from(indice.array.slice(grupo.start, grupo.start + grupo.count)));
        partes.push({ geometria: parte, material });
      }
      return;
    }
    partes.push({ geometria, material: materiais[0] as THREE.Material });
  });
  modelos.set(nome, partes);
}

/** Carrega vários modelos; os que faltam no disco são avisados e ficam de fora. */
export async function carregarModelosDoCenario(nomes: readonly string[]): Promise<void> {
  await Promise.all(
    [...new Set(nomes)].map(async (nome) => {
      try {
        await carregar(nome);
      } catch (erro) {
        console.warn(`modelo de cenário ${nome} não carregou`, erro);
      }
    }),
  );
}

export function modeloDoCenarioPronto(nome: string): boolean {
  return modelos.has(nome);
}

/** Altura do modelo em unidades do arquivo, para ajustar à altura do jogo. */
export function alturaDoModelo(nome: string): number {
  const partes = modelos.get(nome);
  if (!partes) return 1;
  let maior = 0;
  for (const parte of partes) {
    parte.geometria.computeBoundingBox();
    maior = Math.max(maior, parte.geometria.boundingBox?.max.y ?? 0);
  }
  return maior;
}

/** Cópia solta de um modelo (para quem se mexe, como a árvore que tomba). */
export function criarModeloDoCenario(nome: string, escala = 1): THREE.Group {
  const grupo = new THREE.Group();
  for (const parte of modelos.get(nome) ?? []) {
    const malha = new THREE.Mesh(parte.geometria, parte.material);
    malha.scale.setScalar(escala);
    grupo.add(malha);
  }
  return grupo;
}

/** Todo o enfeite fixo da ilha, em malhas instanciadas. */
export function criarCenario(): THREE.Group {
  const grupo = new THREE.Group();
  grupo.name = 'cenario';

  const porModelo = new Map<string, Colocacao[]>();
  for (const colocacao of colocacoesDoCenario()) {
    const lista = porModelo.get(colocacao.modelo) ?? [];
    lista.push(colocacao);
    porModelo.set(colocacao.modelo, lista);
  }

  const matriz = new THREE.Matrix4();
  const posicao = new THREE.Vector3();
  const rotacao = new THREE.Quaternion();
  const escala = new THREE.Vector3();
  const eixoY = new THREE.Vector3(0, 1, 0);

  for (const [nome, lista] of porModelo) {
    const partes = modelos.get(nome);
    if (!partes) continue;
    for (const parte of partes) {
      const malha = new THREE.InstancedMesh(parte.geometria, parte.material, lista.length);
      for (const [i, c] of lista.entries()) {
        posicao.set(c.x, c.y, c.z);
        rotacao.setFromAxisAngle(eixoY, c.giro);
        escala.set(c.escala, c.escalaY, c.escala);
        malha.setMatrixAt(i, matriz.compose(posicao, rotacao, escala));
      }
      malha.instanceMatrix.needsUpdate = true;
      malha.name = nome;
      grupo.add(malha);
    }
  }
  return grupo;
}

/** Nomes de todos os modelos que o mapa usa, para carregar antes de desenhar. */
export function modelosDoMapa(): string[] {
  return colocacoesDoCenario().map((c) => c.modelo);
}
