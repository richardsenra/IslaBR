# IslaBR

Jogo 3D online em cartoon colorido (three.js + Colyseus). Spec em [SPEC.md](SPEC.md).

## Requisitos

- Node 24+ e pnpm 10 (`npm i -g pnpm@10`)
- Docker (para o Postgres e o servidor)

## Rodando

```sh
pnpm install

# Opção 1: tudo local (servidor com hot reload)
docker compose up -d postgres
pnpm dev                 # cliente em http://localhost:5173 e servidor na porta 2567

# Opção 2: servidor no Docker
docker compose up -d     # Postgres e servidor
pnpm dev:client          # só o cliente
```

### Postgres sem Docker

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

Abra duas abas em http://localhost:5173: o canto superior direito mostra "2 jogadores".

## Controles

| Tecla | Ação |
| --- | --- |
| W A S D | andar (direção relativa à câmera) |
| Espaço | pular |
| Shift | esquivar — rolando, o personagem passa por vãos baixos |
| Mouse | girar a câmera (clique no canvas para capturar o ponteiro; Esc solta) |
| Roda | aproximar e afastar a câmera |

A arena de testes tem escada de caixas, duas plataformas, um vão baixo e um
paredão para conferir a colisão da câmera. Ela é provisória: o greybox das
zonas da ilha chega no M4.

### Conferindo o movimento em rede

`http://localhost:5173/?lag=100` simula 100 ms de latência de ida e volta, no
envio e no recebimento. Duas abas com esse parâmetro devem mostrar uma à outra
andando liso, sem saltos. O HUD mostra fps, estado do personagem, posição e
quantas correções o servidor mandou — correções subindo sem parar significam
cliente e servidor discordando.

## Verificações

```sh
pnpm lint && pnpm typecheck && pnpm test
```

O CI (GitHub Actions) roda as mesmas verificações a cada push e pull request.
