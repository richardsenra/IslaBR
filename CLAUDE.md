# IslaBR

Jogo 3D online em cartoon colorido (three.js no cliente, Node + Colyseus no servidor). A spec completa está em `SPEC.md`: leia antes de qualquer tarefa e siga os milestones na ordem.

## Comandos (criar no M0)

- `pnpm install` — instala tudo
- `pnpm dev` — cliente (Vite) e servidor em modo desenvolvimento
- `pnpm test` — Vitest em todos os pacotes
- `pnpm typecheck` e `pnpm lint` — devem passar antes de cada commit
- `docker compose up -d` — Postgres e servidor

## Regras

- TypeScript estrito. Sem `any` sem comentário explicando.
- Conteúdo do jogo (missões, baús, inimigos, itens, falas) fica em `packages/content` como JSON validado por zod. Não coloque conteúdo no código.
- O servidor é autoritativo para dano, drops, moedas, joias, baús e progresso de missão. O cliente nunca decide isso.
- Regras puras (dano, XP, sorteio de drop) ficam em `packages/shared` e têm teste.
- Textos do jogo em português do Brasil, em `dialogues.pt-BR.json`.
- Não use nomes, arte ou textos do MilMo. Use placeholders ou assets CC0 até haver arte própria.
- Faça commits pequenos, um por tarefa, com mensagem descrevendo o porquê.
- Ao fim de cada milestone, rode os critérios de aceite da seção 9 do `SPEC.md` e diga o que passou e o que não passou.
- Se algo na spec estiver ambíguo ou em conflito, pergunte antes de decidir, a menos que esteja marcado como "(proposta)".