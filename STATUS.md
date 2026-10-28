# Status do projeto

Atualizado em 2026-10-28. A spec e os critérios de aceite estão em [SPEC.md](SPEC.md) (seção 9).

## Onde estamos

**M0 a M5 estão feitos no código e nos testes automáticos. Falta testar à mão e polir (M6 vem depois).**

| Milestone | Situação | Aceite |
| --- | --- | --- |
| M0 — Esqueleto | Feito | Monorepo, CI, compose e sala `island` com contagem de jogadores |
| M1 — Personagem e câmera | Feito | Predição, interpolação e `?lag=100` funcionando; 60 fps medido só a olho |
| M2 — Interação, diálogo e missões | Feito | m01 e m02 de ponta a ponta; progresso no Postgres; motor de missões testado |
| M3 — Combate, inimigos e loot | Feito | 8 caranguejos concluem a m04; drops conferidos em 1000 simulações (`drops.test.ts`, `m04.test.ts`) |
| M4 — Mundo e conteúdo (z1–z5) | Feito | m01 a m09 cumpridas de ponta a ponta em teste automático; faltam testar à mão e polir o visual |
| M5 — Caverna e chefe | Feito | Zona z6 com portões de trava, 3 comportas, trajeto do tentáculo, chefe em 3 fases, m12 a m14; testes com 1 e 4 jogadores e com saída no meio |
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

## M4: feito (falta só o polimento visual)

Entregue:

1. Greybox das zonas z1–z5 em `packages/content/data/world.json`, validado por zod e por referências cruzadas.
2. Baús c01–c08 no mundo, abrindo uma vez por jogador.
3. Cenário com modelos CC0 da Quaternius nas cinco zonas (o encaixe das paredes modulares foi palpite).
4. Portões: cada zona fica fechada até a missão que a libera ser aceita (servidor valida, cliente prevê).
5. Insígnias b01, b02, b04, b06, b07 e gatilhos de chegada; moedas soltas (30); NPCs Zé Calango, Tito e Iracema nas falésias.
6. Loja do Seu Bento (depois da m03) e bancada do Zé Calango, com compra e fabricação conferidas no servidor.
7. Mini-chefes mb1 e mb2, com círculo de aviso no chão.
8. Teste de aceite: um jogador novo cumpre a m01 até a m09 só com o que existe no mundo (`mundo.test.ts`).

Dívidas conhecidas do M4:

- Insígnia b03 (pântano sem pisar na água): o pântano ainda não tem água.
- Moedas soltas e frutas voltam a cada sessão (não vão para o banco).
- Visual de objetos de missão (lanternas, ervas, bancada, chave) ainda são caixas coloridas.
- Os tentáculos e o chefe ficam para o M5.

## M5: feito (falta testar à mão)

- Caverna (z6) com camp do Dr. Anselmo, sala seca (c09), salas internas (alagadas até a m11) e sala do chefe (aberta pela m12).
- Tentáculo-Guardião: núcleo + 4 tentáculos, 3 fases (20/20/15), janela de dano ao cortar tentáculo, maré e tinta na fase 2, salvas na fase 3.
- Vida escala por jogador na sala; sala vazia por 10 s zera a luta; vitória vale para quem estava na sala; b08 para quem não levou dano; c10 abre depois da vitória.
- Teste de aceite: `mundo.test.ts` cumpre m01 a m14; `luta.test.ts` derrota o chefe com 1 e com 4 jogadores, um saindo no meio.

Dívidas do M5:

- O visual do chefe e dos tentáculos é de primitivas; o tentáculo gigante do corredor é só um tubo.
- Não há luz de caverna nem teto: a caverna é um recinto de paredes de rocha a céu aberto.
- O alcance do golpe contra o núcleo foi conferido só por teste automático (jogador no chão); da plataforma não foi.
- Balanceamento (vida, dano, tempos) são valores iniciais.

## Antes do M6

Falta rodar o jogo e jogar de ponta a ponta para ver o que está feio ou injusto. O M6 (casa-lobby, toon shading, áudio, carregamento) só começa depois.
