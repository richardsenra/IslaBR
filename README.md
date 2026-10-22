# IslaBR

Jogo 3D online em cartoon colorido, jogado no navegador: three.js no cliente,
Node e Colyseus no servidor. A spec completa da primeira ilha está em
[SPEC.md](SPEC.md).

O projeto está em construção. Hoje dá para andar pela arena de testes com outras
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
| F | falar com quem está perto, abrir baú, quebrar caixa e passar a fala |
| Mouse | girar a câmera |
| Roda | aproximar e afastar |

O canto superior direito mostra quantas pessoas estão na mesma instância. Abra
uma segunda aba para ver seu segundo personagem andando ao lado do primeiro.

## O que dá para fazer hoje

**Duas missões.** Fale com a **Capitã Nara** (o boneco vermelho à frente de
quem acabou de entrar) e siga o que ela pedir: apresentar-se ao **Seu Bento** e
à **Dona Iracema**, voltar, e depois quebrar as cinco caixas do cais. O objetivo
atual fica no canto superior esquerdo, embaixo dos corações e das moedas.

**A arena de testes.** Ela é provisória e serve para exercitar o movimento:

- a escada de caixas sobe até duas plataformas, uma delas exigindo um pulo
- o bloco rosa tem um vão baixo: andando não passa, rolando com Shift passa
- os muros servem para ver a câmera encurtar em vez de atravessar parede

**Rede com atraso.** <http://localhost:5173/?lag=100> simula 100 ms de latência
de ida e volta. Com duas abas abertas assim, o personagem da outra aba deve
continuar andando liso.

O HUD de depuração mostra fps, estado do personagem, posição e quantas correções
o servidor mandou. Correções subindo sem parar significam cliente e servidor
discordando de posição.

Ainda **não** existem: combate, inimigos, loja, fabricação, as outras zonas da
ilha e progresso salvo (recarregar a página recomeça do zero).

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

## Banco de dados (ainda não é preciso)

O progresso em Postgres entra no próximo passo do projeto. Quando entrar:

```sh
docker compose up -d postgres   # sobe só o banco
docker compose up -d            # sobe banco e servidor
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
