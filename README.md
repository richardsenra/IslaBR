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
