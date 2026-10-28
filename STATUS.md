# Status do projeto

Atualizado em 2026-10-28. A spec e os critérios de aceite estão em [SPEC.md](SPEC.md) (seção 9).

## Onde estamos

**M0 a M3 estão feitos. O M4 está em andamento.**

| Milestone | Situação | Aceite |
| --- | --- | --- |
| M0 — Esqueleto | Feito | Monorepo, CI, compose e sala `island` com contagem de jogadores |
| M1 — Personagem e câmera | Feito | Predição, interpolação e `?lag=100` funcionando; 60 fps medido só a olho |
| M2 — Interação, diálogo e missões | Feito | m01 e m02 de ponta a ponta; progresso no Postgres; motor de missões testado |
| M3 — Combate, inimigos e loot | Feito | 8 caranguejos concluem a m04; drops conferidos em 1000 simulações (`drops.test.ts`, `m04.test.ts`) |
| M4 — Mundo e conteúdo (z1–z5) | Em andamento | Greybox e baús no mundo; faltam travas de zona, loja, crafting, mini-chefes, insígnias e missões m05–m11 |
| M5 — Caverna e chefe | Não começou | — |
| M6 — Casa-lobby, estilo e polimento | Não começou | — |

### Verificação de hoje

- `pnpm typecheck`: passa.
- `pnpm test`: `content` (41) e `shared` (216) passam. No `server`, 139 passam, 6 são
  ignorados e `persistencia.test.ts` falha porque não há Postgres no ar
  (`ECONNREFUSED 5432`). Não é bug de código: suba o Postgres local (veja o README)
  e rode de novo.
- `pnpm lint`: não foi rodado nesta checagem.

## O que já existe além do exigido

- Troca do boneco pelo Superhero da Quaternius, com as animações da UAL.
- Combate estilo hack-and-slash: fila de golpes, mira assistida, mergulho com espada, carregado.
- HUD refeito, inventário com abas, barra de atalhos de poções, menu do Esc.
- Escolha da arma da mão, machado e árvores que caem e dão madeira (recurso do M4 chegando cedo).
- Conteúdo da ilha inteira já está em `packages/content/data` (zonas, missões, baús,
  insígnias, loja, receitas), mas só parte está ligada ao jogo.

## Pendências conhecidas

- Z3, z4 e z5 são greybox (caixas coloridas); o encaixe das paredes modulares (qual lado é a frente) foi um palpite a conferir olhando; a ilhota do c05 ainda não tem água.
- Zé Calango e Tito ainda não aparecem no mundo.
- Faltam loja, bancada de fabricação, mini-chefes mb1 e mb2, insígnias no mundo,
  moedas soltas e a maior parte dos baús no mundo (o código de abrir baú existe, falta
  colocar os baús nas zonas).
- Missões m03 e m04 funcionam na arena; m05 a m11 dependem das zonas.
- Medição de 60 fps em notebook comum e teste de sala com 8 jogadores e 20 inimigos
  (SPEC seção 10) ainda não foram feitos.
- Questões em aberto da SPEC seção 12 (curva de XP, destino do chefe, estilo de arte).

## M4: andamento

Feito:

1. Greybox das zonas z1–z5 em `packages/content/data/world.json` (chão por quadra,
   peças de colisão, alvos, árvores e bichos), validado por zod e por referências cruzadas.
   Zona z6 reservada. O `arena.ts` em `shared` só traduz o JSON.
2. Baús c01–c08 colocados no mundo (c02 no telhado, c03 na gruta, c07 em plataformas, c06 no cume).
3. Cenário com modelos CC0 (Quaternius) no Porto e na Vila: farol, casas, loja, cerca, mato, flores,
   mata em volta da ilha e as árvores cortáveis. Z3, z4 e z5 ainda são caixas coloridas.

Falta, nesta ordem:

3b. Cenário em modelos nas zonas z3, z4 e z5.
3. Travar as zonas até a missão que as libera ser aceita (SPEC seção 13, item 3).
4. Insígnias (b02, b03, b04, b06, b07) e moedas soltas.
5. Loja do Seu Bento e bancada de fabricação do Zé Calango.
6. Mini-chefes mb1 e mb2.
7. NPCs Zé Calango e Tito, objetos das missões m05 a m11, e as missões jogáveis.

**Aceite do M4:** um jogador novo chega até a m09 só seguindo diálogos e dicas, e todos
os baús abrem uma vez por jogador.
