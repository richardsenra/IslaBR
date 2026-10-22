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

Abra duas abas em http://localhost:5173: o canto superior direito mostra "2 jogadores".

## Verificações

```sh
pnpm lint && pnpm typecheck && pnpm test
```

O CI (GitHub Actions) roda as mesmas verificações a cada push e pull request.
