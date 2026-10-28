#!/usr/bin/env node
/**
 * Prepara os modelos da Quaternius (CC0) para o jogo.
 *
 *   node scripts/preparar-modelos.mjs <pasta-dos-personagens> <UAL1.glb> <UAL2.glb> [pasta-dos-props]
 *
 * - <pasta-dos-personagens>: onde estão Superhero_Male_FullBody.gltf e
 *   Superhero_Female_FullBody.gltf, com os .bin e as texturas (do pacote
 *   "Universal Base Characters", pasta "Godot - UE").
 * - UAL1.glb e UAL2.glb: "Universal Animation Library" 1 e 2 (versão sem
 *   root motion, pasta "Unreal-Godot").
 * - pasta-dos-props (opcional): onde estão Sword_Bronze.gltf, o .bin e a textura
 *   T_Trim_Props_BaseColor.png, do pacote "Fantasy Props MegaKit" (pasta "glTF").
 *
 * O que faz, e por quê (SPEC §10: 60 fps com 8 jogadores, 150 desenhos por zona):
 * - Junta corpo, sobrancelha e olhos num só material e numa só malha. O pacote
 *   traz três materiais por personagem e texturas de 2048×2048 (~100 MB na placa
 *   de vídeo); aqui viram um atlas JPEG de 1024×1536 e um desenho por jogador.
 * - Das animações, guarda só as que o jogo usa. O resto de cada biblioteca é
 *   uma malha de 65 ossos que o jogo já tem.
 *
 * Saída em apps/client/public/models/.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, resample } from '@gltf-transform/functions';
import sharp from 'sharp';

const [pastaPersonagens, ual1, ual2, pastaProps] = process.argv.slice(2);
if (!pastaPersonagens || !ual1 || !ual2) {
  console.error(
    'uso: node scripts/preparar-modelos.mjs <pasta-dos-personagens> <UAL1.glb> <UAL2.glb>',
  );
  process.exit(1);
}

const saida = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/models');
await mkdir(saida, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/** Animações que o jogo usa de cada biblioteca; ver CLIPES_UAL em src/models.ts. */
const ANIMACOES = {
  [ual1]: [
    'Idle_Loop',
    'Walk_Loop',
    'Jog_Fwd_Loop',
    'Sprint_Loop',
    'Jump_Start',
    'Jump_Loop',
    'Jump_Land',
    'Roll',
    'Hit_Chest',
    'Hit_Head',
    'Death01',
    'Interact',
    'Sword_Idle',
    'PickUp_Table',
    'Idle_Talking_Loop',
  ],
  [ual2]: [
    'Sword_Regular_A',
    'Sword_Regular_A_Rec',
    'Sword_Regular_B',
    'Sword_Regular_B_Rec',
    'Sword_Regular_C',
    'Sword_Regular_Combo',
    'Sword_Heavy_Combo',
    'Sword_Dash',
    'Sword_Block',
    'Hit_Knockback',
    'Chest_Open',
    'Consume',
    'NinjaJump_Start',
    'NinjaJump_Idle_Loop',
    'NinjaJump_Land',
  ],
};

/** Tamanho do atlas e de cada região dele. */
const ATLAS = { largura: 1024, altura: 1536 };
const REGIOES = {
  corpo: { x: 0, y: 0, w: 1024, h: 1024 },
  cabelo: { x: 0, y: 1024, w: 512, h: 512 },
  // Os olhos do modelo masculino usam UV até ~1,2 (a textura se repete):
  // a região tem a textura de 256 duas vezes lado a lado.
  olhos: { x: 512, y: 1024, w: 512, h: 256 },
};
const LADO_DOS_OLHOS = 256;

function papelDoMaterial(nome) {
  if (/Eyes/i.test(nome)) return 'olhos';
  if (/Hair/i.test(nome)) return 'cabelo';
  return 'corpo';
}

async function imagemDe(material, lado) {
  const textura = material.getBaseColorTexture();
  if (!textura) throw new Error(`material ${material.getName()} sem textura`);
  return sharp(Buffer.from(textura.getImage()))
    .resize(lado[0], lado[1], { fit: 'fill' })
    .removeAlpha()
    .png()
    .toBuffer();
}

async function personagem(entrada, destino) {
  const doc = await io.read(entrada);
  const root = doc.getRoot();

  // Primitiva de cada papel, com o material de onde sai a textura.
  const partes = {};
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const papel = papelDoMaterial(prim.getMaterial().getName());
      if (partes[papel]) throw new Error(`${entrada}: duas partes de ${papel}`);
      partes[papel] = { prim, mesh };
    }
  }
  for (const papel of ['corpo', 'cabelo', 'olhos']) {
    if (!partes[papel]) throw new Error(`${entrada}: falta a parte ${papel}`);
  }

  // Atlas.
  const camadas = [
    { input: await imagemDe(partes.corpo.prim.getMaterial(), [1024, 1024]), left: 0, top: 0 },
    { input: await imagemDe(partes.cabelo.prim.getMaterial(), [512, 512]), left: 0, top: 1024 },
  ];
  const olho = await imagemDe(partes.olhos.prim.getMaterial(), [LADO_DOS_OLHOS, LADO_DOS_OLHOS]);
  camadas.push({ input: olho, left: REGIOES.olhos.x, top: REGIOES.olhos.y });
  camadas.push({ input: olho, left: REGIOES.olhos.x + LADO_DOS_OLHOS, top: REGIOES.olhos.y });
  const atlas = await sharp({
    create: { width: ATLAS.largura, height: ATLAS.altura, channels: 3, background: '#7a7a7a' },
  })
    .composite(camadas)
    .jpeg({ quality: 88 })
    .toBuffer();

  // UVs para dentro das regiões do atlas.
  const lados = {
    corpo: [REGIOES.corpo.w, REGIOES.corpo.h],
    cabelo: [REGIOES.cabelo.w, REGIOES.cabelo.h],
    olhos: [LADO_DOS_OLHOS, LADO_DOS_OLHOS],
  };
  for (const papel of Object.keys(partes)) {
    const uv = partes[papel].prim.getAttribute('TEXCOORD_0');
    const { x, y } = REGIOES[papel];
    const [w, h] = lados[papel];
    for (let i = 0; i < uv.getCount(); i += 1) {
      const [u, v] = uv.getElement(i, [0, 0]);
      uv.setElement(i, [(x + u * w) / ATLAS.largura, (y + v * h) / ATLAS.altura]);
    }
  }

  // Material único.
  const textura = doc
    .createTexture('atlas')
    .setImage(new Uint8Array(atlas))
    .setMimeType('image/jpeg');
  const material = doc
    .createMaterial('personagem')
    .setBaseColorTexture(textura)
    .setRoughnessFactor(1)
    .setMetallicFactor(0)
    .setDoubleSided(true);

  // Uma malha só, com as três partes em sequência.
  const ordem = ['corpo', 'cabelo', 'olhos'].map((papel) => partes[papel].prim);
  const buffer = root.listBuffers()[0];
  const total = ordem.reduce((n, p) => n + p.getAttribute('POSITION').getCount(), 0);
  const juntar = (nome, Tipo, tipo, componentes) => {
    const dados = new Tipo(total * componentes);
    let deslocamento = 0;
    for (const prim of ordem) {
      const acessor = prim.getAttribute(nome);
      const origem = acessor.getArray();
      dados.set(origem, deslocamento);
      deslocamento += origem.length;
    }
    return doc.createAccessor(nome).setType(tipo).setArray(dados).setBuffer(buffer);
  };
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', juntar('POSITION', Float32Array, 'VEC3', 3))
    .setAttribute('NORMAL', juntar('NORMAL', Float32Array, 'VEC3', 3))
    .setAttribute('TEXCOORD_0', juntar('TEXCOORD_0', Float32Array, 'VEC2', 2))
    .setAttribute('JOINTS_0', juntar('JOINTS_0', Uint16Array, 'VEC4', 4))
    .setAttribute('WEIGHTS_0', juntar('WEIGHTS_0', Float32Array, 'VEC4', 4))
    .setMaterial(material);
  const indices = new Uint16Array(ordem.reduce((n, p) => n + p.getIndices().getCount(), 0));
  let posicao = 0;
  let base = 0;
  for (const p of ordem) {
    for (const indice of p.getIndices().getArray()) indices[posicao++] = indice + base;
    base += p.getAttribute('POSITION').getCount();
  }
  prim.setIndices(
    doc.createAccessor('indices').setType('SCALAR').setArray(indices).setBuffer(buffer),
  );

  const malha = doc.createMesh('personagem').addPrimitive(prim);
  const noCorpo = root.listNodes().find((n) => n.getMesh() === partes.corpo.mesh);
  for (const papel of ['cabelo', 'olhos']) {
    const no = root.listNodes().find((n) => n.getMesh() === partes[papel].mesh);
    if (no) no.dispose();
  }
  noCorpo.setMesh(malha);

  await doc.transform(prune({ keepLeaves: true }));
  await io.write(destino, doc);
  console.log(
    `${path.basename(destino)}: ${total} vértices, ${indices.length / 3} triângulos, ` +
      `atlas ${(atlas.length / 1024).toFixed(0)} KB`,
  );
}

/**
 * Arma do Fantasy Props MegaKit: o pacote usa uma folha de texturas de 2048×2048
 * com mapa de normal e de rugosidade. Aqui fica só a cor, em 512×512 JPEG, que é
 * o que se enxerga numa espada de 1 m vista de longe.
 */
async function arma(entrada, destino) {
  const doc = await io.read(entrada);
  const root = doc.getRoot();
  for (const material of root.listMaterials()) {
    const textura = material.getBaseColorTexture();
    if (textura) {
      const jpeg = await sharp(Buffer.from(textura.getImage()))
        .resize(512, 512, { fit: 'fill' })
        .removeAlpha()
        .jpeg({ quality: 88 })
        .toBuffer();
      textura.setImage(new Uint8Array(jpeg)).setMimeType('image/jpeg').setURI('');
    }
    // Sem o mapa de rugosidade e sem ambiente, o metal puro fica preto.
    material
      .setNormalTexture(null)
      .setOcclusionTexture(null)
      .setMetallicRoughnessTexture(null)
      .setMetallicFactor(0.1)
      .setRoughnessFactor(0.6);
  }
  await doc.transform(prune(), prune());
  await io.write(destino, doc);
  const bytes = root.listBuffers()[0] ? 'ok' : '?';
  console.log(`${path.basename(destino)}: ${bytes}`);
}

async function animacoes(entrada, destino, manter) {
  const doc = await io.read(entrada);
  const root = doc.getRoot();
  const existentes = new Set(root.listAnimations().map((a) => a.getName()));
  for (const nome of manter) {
    if (!existentes.has(nome))
      console.warn(`  aviso: ${nome} não existe em ${path.basename(entrada)}`);
  }
  for (const animacao of root.listAnimations()) {
    if (manter.includes(animacao.getName())) continue;
    // Canais e amostradores são propriedades próprias: soltá-los é o que libera os dados.
    for (const canal of animacao.listChannels()) canal.dispose();
    for (const amostrador of animacao.listSamplers()) amostrador.dispose();
    animacao.dispose();
  }
  for (const no of root.listNodes()) {
    no.setMesh(null);
    no.setSkin(null);
  }
  // Osso não estica: só o quadril e a raiz mudam de posição, e a escala é sempre 1.
  for (const animacao of root.listAnimations()) {
    for (const canal of animacao.listChannels()) {
      const caminho = canal.getTargetPath();
      const osso = canal.getTargetNode()?.getName();
      const fica =
        caminho === 'rotation' ||
        (caminho === 'translation' && (osso === 'root' || osso === 'pelvis'));
      if (!fica) {
        const amostrador = canal.getSampler();
        animacao.removeChannel(canal);
        canal.dispose();
        animacao.removeSampler(amostrador);
        amostrador.dispose();
      }
    }
  }
  // Duas passadas: as texturas só ficam sem uso depois que os materiais saem.
  await doc.transform(
    resample({ tolerance: 1e-4 }),
    prune({ keepLeaves: true }),
    prune({ keepLeaves: true }),
  );
  await io.write(destino, doc);
  console.log(`${path.basename(destino)}: ${root.listAnimations().length} animações`);
}

await personagem(
  path.join(pastaPersonagens, 'Superhero_Male_FullBody.gltf'),
  path.join(saida, 'Superhero_Male.glb'),
);
await personagem(
  path.join(pastaPersonagens, 'Superhero_Female_FullBody.gltf'),
  path.join(saida, 'Superhero_Female.glb'),
);
await animacoes(ual1, path.join(saida, 'Anim_UAL1.glb'), ANIMACOES[ual1]);
await animacoes(ual2, path.join(saida, 'Anim_UAL2.glb'), ANIMACOES[ual2]);
if (pastaProps) {
  await arma(path.join(pastaProps, 'Sword_Bronze.gltf'), path.join(saida, 'Sword_Bronze.glb'));
}
await writeFile(
  path.join(saida, 'LICENSE-QUATERNIUS.md'),
  [
    '# Quaternius (CC0 1.0)',
    '',
    'Superhero_Male.glb, Superhero_Female.glb: derivados de "Universal Base Characters"',
    '(texturas reduzidas e fundidas num atlas; ver apps/client/scripts/preparar-modelos.mjs).',
    '',
    'Anim_UAL1.glb, Anim_UAL2.glb: animações selecionadas de "Universal Animation Library" 1 e 2.',
    '',
    'Sword_Bronze.glb: derivado de "Fantasy Props MegaKit" (textura reduzida a 512 px).',
    '',
    'Autor: Quaternius (https://quaternius.com). Licença: CC0 1.0 Universal, domínio público',
    '(https://creativecommons.org/publicdomain/zero/1.0/).',
    '',
  ].join('\n'),
);
