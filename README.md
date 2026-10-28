# IslaBR

Jogo 3D online em cartoon colorido, jogado no navegador: three.js no cliente,
Node e Colyseus no servidor. A spec completa da primeira ilha está em
[SPEC.md](SPEC.md).

O projeto está em construção. Em que milestone estamos e qual é o próximo passo
estão em [STATUS.md](STATUS.md). Hoje dá para andar pela arena de testes com outras
pessoas e jogar as duas primeiras missões da história.

## Do zero até jogar

### 1. O que precisa estar instalado

| Programa | Versão | Como conferir |
| --- | --- | --- |
| [Node.js](https://nodejs.org) | 24 ou mais novo | `node -v` |
| pnpm | 10 | `pnpm -v` |
| Git | qualquer | `git --version` |

Se o `node -v` mostrar menos que 24, instale a versão do arquivo
[.nvmrc](.nvmrc) (com [nvm](https://github.com/nvm-sh/nvm) ou
[nvm-windows](https://github.com/coreybutler/nvm-windows), rode `nvm install 24`
e `nvm use 24`).

Se o `pnpm -v` disser que o comando não existe, escolha um:

```sh
npm install -g pnpm@10     # jeito mais simples
corepack enable pnpm       # alternativa, já vem com o Node (pode pedir administrador)
```

Docker **não** é necessário para jogar: nada no jogo usa banco de dados ainda.

### 2. Clonar e instalar

```sh
git clone https://github.com/richardsenra/IslaBR.git
cd IslaBR
pnpm install
```

O `pnpm install` baixa as dependências de todos os pacotes do monorepo de uma
vez. Leva menos de um minuto.

### 3. Subir o jogo

```sh
pnpm dev
```

Esse comando sobe duas coisas ao mesmo tempo:

- o **cliente** em <http://localhost:5173> (Vite, com recarga automática)
- o **servidor** na porta 2567 (Colyseus)

Espere as duas linhas aparecerem no terminal:

```
apps/client dev:   ➜  Local:   http://localhost:5173/
apps/server dev: IslaBR server ouvindo na porta 2567
```

### 4. Jogar

Abra <http://localhost:5173> e **clique no canvas** para o mouse controlar a
câmera (Esc devolve o cursor).

| Tecla | Ação |
| --- | --- |
| W A S D | andar, na direção para onde a câmera olha |
| Espaço | pular |
| Shift | esquivar; rolando, o personagem passa por vãos baixos |
| Clique ou J | atacar; três toques seguidos fazem o combo, e segurar 0,6 s dá o golpe carregado (o golpe sai ao soltar) |
| F | falar com quem está perto, abrir baú, colher, quebrar caixa e passar a fala |
| I | abrir e fechar o inventário (com ele aberto, clique num item ou aperte 1–9 para usar) |
| Mouse ou Q/E | girar a câmera (o golpe sai para onde ela olha) |
| Roda | aproximar e afastar |

O primeiro clique só captura o mouse; os seguintes atacam. Sem o mouse capturado,
a tecla J ataca do mesmo jeito.

O canto superior direito mostra quantas pessoas estão na mesma instância. Abra
uma segunda aba para ver seu segundo personagem andando ao lado do primeiro.

## O que dá para fazer hoje

**Duas missões.** Fale com a **Capitã Nara** (o boneco vermelho à frente de
quem acabou de entrar) e siga o que ela pedir: apresentar-se ao **Seu Bento** e
à **Dona Iracema**, voltar, e depois quebrar as cinco caixas do cais. O objetivo
atual fica no canto superior esquerdo, embaixo dos corações e das moedas.

**Combate.** Termine a m01 para ganhar o **Graveto Reforçado**: sem arma na mão o
golpe não machuca. A arma aparece na mão do boneco (o graveto como adaga, e a
**Espada de Coral**, de 2 de dano, como espada).

Para testar o combate sem cumprir missão, ligue o kit de teste no servidor:
`ISLABR_KIT_DE_TESTE=graveto_reforcado,arma_nv2,machado` em `apps/server/.env` dá as
duas armas e o machado a quem entra. Deixe vazio num servidor de verdade. Os **caranguejos** ficam espalhados pelo leste e pelo sul da
arena; chegue perto e eles te perseguem e mordem (meio coração). Dois golpes
derrubam um caranguejo comum, e o carregado derruba em um. Esquivar (Shift) dá
um instante de invulnerabilidade. Os **espinhosos** (marrom-escuros, no oeste)
devolvem o golpe se você bate de frente: dê a volta e ataque pelas costas. Quem
fica sem corações renasce na hora no ponto de partida, com a vida cheia e um
instante de invulnerabilidade.

**Cortar árvore.** Com o **Machado de Bronze** na mão (abra o inventário com
`I` e clique em **Equipar**), bata nas árvores: cada machadada tira um golpe, e
a última derruba. O **coqueiro** cai em 4 golpes e dá 2 ou 3 toras de madeira,
às vezes com uma fruta; a **árvore seca** cai em 2 e dá 1 tora. A árvore volta a
crescer do toco depois de uns 20 segundos. Duas delas ficam perto de onde você
nasce, e as outras três espalhadas pela arena.

A espada bate o dobro do machado, mas não derruba árvore: vale trocar na mão
conforme o que você vai fazer. Bater na árvore sem machado não dá nada.

Às vezes o inimigo some atrás do boneco, porque a câmera fica atrás dele; nessas
horas o boneco fica semitransparente e a barra de vida mostra onde o bicho está.

**Os cinco bichos.** Cada um tem um jeito de atacar, e todos avisam antes:

| Bicho | Onde | Como lutar |
| --- | --- | --- |
| Caranguejo | leste e sul | persegue e belisca; dois golpes derrubam |
| Caranguejo espinhoso | oeste | devolve o golpe de frente; ataque pelas costas |
| Mosquito | norte | circula no alto, onde a espada não alcança; treme e mergulha, e é na descida que dá para acertar |
| Sapo gosmento | norte | pula em você e, de longe, infla e cospe gosma que te deixa lento por 3 s (a tela esverdeia) |
| Água-viva | norte | boia devagar, brilha e solta um choque em área: saia do círculo antes |

O que cai dos bichos (moedas, cascas, ferrões, gosma, géis) é sorteado no
servidor. O coração pequeno não vai para o inventário: cura meio coração na hora.
Para a m04, derrote 8 caranguejos depois de colher as 6 frutas da horta da m03,
no canto oeste da vila.

**Inventário.** A tecla I abre uma grade de 20 casas com os itens empilhados.
Consumíveis se usam clicando ou apertando o número da casa: a poção pequena
devolve 2 corações, a grande devolve todos, e a heróica dá 2 corações extras por
um minuto. O servidor recusa poção de cura com a vida cheia, para ninguém gastar
à toa.

**O mapa.** A ilha tem 96 × 96 m, em nove quadras de 32 m. Você nasce no **Porto** (z1,
centro); a **Vila** (z2) fica a leste, a **Praia dos Caranguejos** (z3) ao sul, o
**Pântano** (z4) a oeste e as **Falésias** (z5) ao norte. A quadra do canto
noroeste espera a caverna. Por enquanto as zonas não têm trava: dá para andar
por todas. O desenho está em `packages/content/data/world.json`.

Para os baús: o **c02** está no telhado da loja (suba pelas caixas), o **c03** na gruta
da praia (passe rolando com Shift), o **c07** nas plataformas das falésias (pulos) e o
**c06** no cume; o **c08** fica na casa da Dona Iracema. Os baús que pedem chave ou
missão continuam fechados até você cumprir o requisito.

**Rede com atraso.** <http://localhost:5173/?lag=100> simula 100 ms de latência
de ida e volta. Com duas abas abertas assim, o personagem da outra aba deve
continuar andando liso.

O HUD de depuração mostra fps, estado do personagem, posição e quantas correções
o servidor mandou. Correções subindo sem parar significam cliente e servidor
discordando de posição.

**Seu progresso é guardado** se o servidor tiver banco (veja a seção do final).
O navegador guarda um token de convidado, então recarregar a página devolve
moedas, itens e a missão onde você parou. Sem banco, o jogo roda igual, mas o
progresso só dura enquanto o servidor estiver de pé.

Ainda **não** existem: loja, fabricação, os mini-chefes, o chefe e a caverna.

## Se algo der errado

| Sintoma | O que fazer |
| --- | --- |
| `pnpm: command not found` | Instale o pnpm (passo 1) ou use `corepack pnpm` no lugar de `pnpm` |
| `Port 5173 is in use` | Outro `pnpm dev` já está rodando; feche-o ou abra o endereço que o Vite imprimir (ex.: 5174) |
| HUD diz "Sozinho (sem servidor)" | O servidor não subiu; veja no terminal se a porta 2567 está ocupada |
| A câmera não gira | Clique no canvas uma vez para capturar o ponteiro |
| Erro de versão do Node | `nvm use 24` |

## Para quem for mexer no código

```sh
pnpm lint        # ESLint e Prettier
pnpm typecheck   # TypeScript em todos os pacotes
pnpm test        # Vitest
```

Os três precisam passar antes de cada commit, e o CI roda os mesmos a cada push.

Como o repositório está organizado:

```
apps/client      cliente: three.js, câmera, HUD, predição de movimento
apps/server      servidor: salas Colyseus, validação, missões
packages/shared  regras puras: movimento, colisão, missões, progresso
packages/content JSON do jogo (missões, falas, itens) com schemas zod
```

As regras de movimento e combate vivem em `packages/shared` porque cliente e
servidor precisam calcular a mesma coisa. Conteúdo de jogo nunca fica no
código: está em `packages/content/data`, validado por zod e por testes de
referência cruzada.

Leia [CLAUDE.md](CLAUDE.md) e [SPEC.md](SPEC.md) antes de contribuir: a spec
define os milestones e os critérios de aceite de cada um.

## Banco de dados (opcional, guarda o progresso)

Sem banco o jogo roda; o progresso fica em memória e some quando o servidor
reinicia. Com banco, ele sobrevive a recarregar a página e a reiniciar tudo.

```sh
docker compose up -d postgres   # sobe só o banco
docker compose up -d            # sobe banco e servidor
```

Depois, aponte o servidor para ele copiando o exemplo:

```sh
cp apps/server/.env.example apps/server/.env
pnpm dev
```

O servidor cria as tabelas sozinho ao subir e imprime
`Progresso persistente no Postgres.`; sem banco, avisa que está só em memória e
continua. Para aplicar as migrações à mão, ou depois de mexer no schema:

```sh
pnpm --filter @islabr/server db:generate   # gera o SQL a partir do schema
pnpm --filter @islabr/server db:migrate    # aplica no banco
```

Em máquina sem Docker, dá para rodar um Postgres 17 na pasta do usuário, sem
instalador e sem privilégio de administrador:

```sh
npm install --prefix ~/pgsql @embedded-postgres/windows-x64@17.10.0-beta.17
BIN=~/pgsql/node_modules/@embedded-postgres/windows-x64/native/bin
"$BIN/initdb" -D ~/pgsql/data -U islabr --pwfile=<arquivo com a senha> \
  --encoding=UTF8 --locale=C --auth-host=scram-sha-256
"$BIN/pg_ctl" -D ~/pgsql/data -l ~/pgsql/log/postgres.log -o "-p 5432" start
```

Use usuário, senha e banco `islabr` para a conexão ficar igual à do compose:

```
DATABASE_URL=postgres://islabr:islabr@localhost:5432/islabr
```

O banco `islabr` precisa ser criado uma vez (`create database islabr`); esses
binários não trazem `psql`, então o jeito mais simples é por um script com o
driver `pg`. Postgres local e Postgres do Docker disputam a porta 5432: suba um
de cada vez.
