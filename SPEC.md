# IslaBR — Spec técnica da primeira ilha (v0.3)

Spec para o Claude Code iniciar o projeto. Fonte: GDD "IslaBR — Roteiro da Primeira Ilha". Em caso de conflito, este arquivo vence.

## 0. Como usar este arquivo

1. Leia tudo antes de escrever código.
2. Siga os milestones da seção 9 em ordem. Só avance quando os critérios de aceite do milestone atual passarem.
3. Todo conteúdo do jogo (missões, baús, inimigos, itens, falas) vive em JSON em `packages/content`, validado por zod. Nunca hardcode conteúdo em código.
4. Itens marcados **(proposta)** são suposições minhas: implemente, mas deixe fácil de trocar.
5. Não use nomes, arte, textos ou assets do MilMo. A wiki foi só referência de estrutura. Todos os nomes abaixo são originais e provisórios.
6. Use placeholders (primitivas do three.js ou assets CC0) até haver arte própria.

## 1. Resumo do produto

IslaBR é um jogo 3D de ação e aventura, online, em cartoon colorido, que roda no navegador com three.js. Esta spec cobre só a primeira ilha: hub (porto e vila), praia, pântano, falésias e uma caverna com chefe, mais a casa pessoal como lobby.

Números da ilha: 6 zonas, 6 NPCs, 14 missões, 10 baús, 8 insígnias, 30 moedas soltas, 5 inimigos comuns, 2 mini-chefes, 1 chefe.

## 2. Decisões fixas

- Online desde o início, com servidor autoritativo.
- Estilo: cartoon colorido (toon shading com contorno).
- Casa pessoal e baú pessoal existem, mas ficam fora da ilha: no navio o jogador escolhe ir para casa, que é um lobby privado.
- Nome do jogo: IslaBR.
- Idioma do jogo: português do Brasil (i18n preparado, mas só `pt-BR` agora).

## 3. Stack e estrutura do repositório

Monorepo TypeScript com pnpm workspaces **(proposta)**.

```
islabr/
  apps/
    client/        # Vite + three.js + TypeScript
    server/        # Node + Colyseus (WebSocket, salas)
  packages/
    shared/        # tipos, constantes, mensagens de rede, regras puras (dano, XP)
    content/       # JSON do jogo + schemas zod + loader
  docker-compose.yml   # postgres + server
  SPEC.md
  CLAUDE.md
```

| Camada | Escolha **(proposta)** | Motivo |
| --- | --- | --- |
| Cliente | three.js, Vite, TypeScript | Pedido do projeto |
| UI/HUD | HTML/CSS sobre o canvas (sem framework no começo) | Simples e rápido de iterar |
| Rede | Colyseus (rooms, schema sync) | Salas = instâncias da ilha e das casas |
| Banco | PostgreSQL + Drizzle ORM | Progresso persistente |
| Física no cliente | Rapier (WASM) só para o jogador, caixas e plataformas | Leve |
| Assets | glTF + Draco, texturas KTX2 | Carregamento rápido |
| Testes | Vitest (shared, content, server), Playwright (smoke do cliente) | Cobertura básica |
| Deploy | Docker Compose | Funciona em qualquer servidor próprio |

## 4. Arquitetura online

- **Servidor autoritativo** para: dano, vida, drops, abertura de baús, progresso de missões, inventário, moedas e joias.
- **Cliente** faz predição de movimento e reconcilia com o servidor. O servidor valida velocidade e posição (anti-teleporte simples).
- **Tick do servidor:** 20 Hz. **Envio de estado:** 10–20 Hz com interpolação no cliente.
- **Salas (rooms):**
  - `island`: instância da ilha, até 8 jogadores **(proposta)**. Entra em uma sala com vaga ou cria outra.
  - `home`: instância privada de um jogador (lobby da casa), com o baú pessoal. Visitas de amigos ficam para depois.
  - `ship`: não é uma sala, é uma tela de menu (ir para a ilha, ir para casa).
- **Chefe e mini-chefes:** estado do chefe é por sala. Quem não participou da luta não recebe a recompensa. Cada jogador tem sua própria checagem de "chefe derrotado" salva no progresso.
- **Baús:** abertura é por jogador, não por sala. Dois jogadores podem abrir o mesmo baú e cada um recebe o conteúdo.
- **Missões:** estado por jogador no banco. O servidor avança objetivos a partir de eventos (`kill`, `collect`, `talk`, `reach`, `use`).
- **Autenticação:** token de convidado persistido no navegador, com conta opcional depois **(proposta)**. Não guarde senhas nesta fase.
- **Chat:** texto simples por sala, com filtro básico de palavrões e limite de taxa **(proposta)**.

### Mensagens de rede (mínimo)

| Direção | Mensagem | Dados |
| --- | --- | --- |
| C→S | `move` | posição, velocidade, yaw, número da sequência |
| C→S | `attack` | tipo de golpe (1–3 ou carregado), direção |
| C→S | `dodge` | direção |
| C→S | `interact` | id do alvo (NPC, baú, objeto) |
| C→S | `dialogue_choice` | id da caixa, opção |
| C→S | `use_item` | id do item |
| C→S | `buy` | id do item, quantidade |
| C→S | `craft` | id da receita |
| C→S | `chat` | texto |
| S→C | `state` | jogadores, inimigos, projéteis (delta) |
| S→C | `damage` | alvo, valor, origem |
| S→C | `quest_update` | missão, objetivo, progresso |
| S→C | `inventory_update` | itens, moedas, joias, corações |
| S→C | `loot` | itens recebidos |

## 5. Modelo de dados (Postgres)

```
players        id, guest_token, name, created_at
progress       player_id, level, xp, hearts_max, coins, gems
inventory      player_id, item_id, qty
quests         player_id, quest_id, status (locked|active|done), step_index, counters jsonb
chests_opened  player_id, chest_id, opened_at
badges         player_id, badge_id, earned_at
boss_kills     player_id, boss_id, killed_at, no_damage bool
home_items     player_id, item_id, slot        # lobby da casa (placeholders por enquanto)
```

Regras:
- Corações começam em 3 e vão até 4 nesta ilha (recompensa da m06).
- Unidade de dano: meio coração (0,5).
- Moedas e joias são inteiros; joias só se ganham jogando (sem compra com dinheiro real).

## 6. Sistemas de gameplay

### Movimento e câmera
- WASD, pulo, esquiva (recarga de 1,2 s), câmera em terceira pessoa com colisão contra paredes.
- Não há mecânica de escalar parede nem de agachar nesta fase. "Escalar" no conteúdo significa subir por pulos em caixas e plataformas. Passagens baixas são atravessadas com a esquiva (rolamento).
- Máquina de estados do personagem: `idle`, `run`, `jump`, `fall`, `attack1..3`, `charged`, `dodge`, `hurt`, `dead`. Transições de 0,1–0,2 s.

### Interação
- Tecla `F` perto de NPC, baú ou objeto (raio de 2 m). Ícone flutuante animado quando há alvo.

### Combate
- Combo de 3 golpes, golpe carregado (segurar o ataque 0,6 s), esquiva com invulnerabilidade curta (0,25 s).
- Hitboxes em esferas presas aos ossos. Dano calculado no servidor.
- Feedback: hit-stop de 60 ms, tremor curto de câmera, números de dano flutuantes.
- Arma inicial "Graveto Reforçado": 1 de dano por golpe. Arma nível 2: 2 por golpe.

### HUD
- Corações (canto superior esquerdo), moedas e joias, contador de insígnias da ilha, objetivo da missão ativa, minimapa simples **(proposta)**, caixa de diálogo, chat.

### Loot e inventário
- Drops sorteados no servidor com a tabela da seção 7.7. Inventário em grade simples com empilhamento.

### Crafting
- Uma bancada do Zé Calango (pântano). Receitas vêm de `content/recipes.json`.

## 7. Conteúdo da primeira ilha

Nome de trabalho da ilha: **Ilha Primeira Maré**. Valores de HP, dano, recompensas e chances são iniciais e serão balanceados depois.

### 7.1 Zonas

| id | Zona | Função | Conteúdo principal | Nível | Liberada por (ao aceitar) |
| --- | --- | --- | --- | --- | --- |
| z1 | Porto | Hub e tutorial | Capitã Nara, caixas quebráveis, farol, navio | 1 | Início |
| z2 | Vila Aconchego | Loja e missões sociais | Seu Bento (loja), Dona Iracema, casas, baú 2 | 1–2 | m01 |
| z3 | Praia dos Caranguejos | Combate básico | Caranguejos, gruta, marcas de ventosa, Caranguejo-Rei | 2–3 | m04 |
| z4 | Pântano Lodoso | Coleta e crafting | Ervas, mosquitos, sapos, Zé Calango, ilhota, Sapo-Ancestral | 3–4 | m05 |
| z5 | Falésias do Vento | Plataforma e vistas | Escaladas, pulos cronometrados, 3 insígnias | 4 | m06 |
| z6 | Caverna do Tentáculo | Dungeon e chefe | Entrada (Dr. Anselmo) e sala 1 secas; salas internas alagadas até a m11; tentáculo gigante; sala do chefe | 4–5 | m10 |

Regra de liberação: uma zona abre quando o jogador **aceita** a missão que a libera, porque o objetivo dessa missão fica dentro da zona. Os demais desbloqueios (baús, loja, crafting, salas, itens) acontecem quando a missão é **concluída**. No JSON da missão: `libera_ao_aceitar` (zonas) e `libera` (o resto).

Fluxo: Porto → Vila → (Praia ou Pântano) → Falésias → Caverna → volta ao Porto. A exploração é livre; só os bloqueios das missões travam o caminho.

### 7.2 NPCs

| id | Nome | Papel | Zona | Missões |
| --- | --- | --- | --- | --- |
| npc_nara | Capitã Nara | Tutorial e guia da história | z1 | m01, m02, m14 |
| npc_bento | Seu Bento | Fazendeiro e lojista | z2 | m03, m04 |
| npc_iracema | Dona Iracema | Curandeira | z2, casa em z5 | m05, m06, m07 |
| npc_calango | Zé Calango | Mago atrapalhado, crafting | z4 | m07, m08 |
| npc_tito | Tito | Pescador que viu o tentáculo | z3 | m09, m10, m11 |
| npc_anselmo | Dr. Anselmo | Cientista de fósseis | z6 (entrada) | m12, m13 |

Tom dos diálogos: curtos (até 3 caixas por fala), bem-humorados, sempre terminando com uma dica de onde ir.

### 7.3 Missões

Cada missão tem: diálogo de entrada, objetivo no HUD, dica do NPC (aparece se o jogador demorar 3 min), diálogo de conclusão e recompensa.

| id | Missão | Requer | Quem dá | Objetivo | Recompensa | Libera |
| --- | --- | --- | --- | --- | --- | --- |
| m01 | Bem-vindo à Ilha | — | npc_nara | Falar com Nara, Seu Bento e Dona Iracema | 10 moedas, Graveto Reforçado | z2 |
| m02 | Caixas no Cais | m01 | npc_nara | Quebrar 5 caixas (ensina ataque) | 15 moedas | Baú c01 |
| m03 | Lista de Compras | m02 | npc_bento | Coletar 6 frutas na horta | 2 poções pequenas | Loja |
| m04 | Praga de Caranguejos | m03 | npc_bento | Derrotar 8 caranguejos na praia (é de lá que eles sobem para a horta) | 25 moedas | z3 |
| m05 | Remédio da Iracema (3 partes) | m03 | npc_iracema | Coletar 3 ervas, derrotar 5 mosquitos, entregar o preparo | 30 moedas, Poção Heróica | z4 |
| m06 | A Chave Perdida | m05 | npc_iracema | Achar a chave nas falésias e abrir a casa dela | Coração extra | z5, baú c08 |
| m07 | Onde Está o Mago? | m05 | npc_iracema | Encontrar o Zé Calango no pântano (puzzle de lanternas) | 20 moedas | Crafting |
| m08 | Repelente Caseiro | m07 | npc_calango | Juntar 2 cascas de caranguejo, 1 gosma e a erva rara (baú c04) e fabricar o repelente na bancada | Receita de poção pequena | Ilhota (c05) |
| m09 | Marcas na Areia | m04, m06, m08 | npc_tito | Achar 3 marcas de ventosa (praia, pântano, falésia) | 35 moedas, Mapa rasgado | m10 |
| m10 | O Mapa Rasgado | m09 | npc_tito | Reunir 3 pedaços de mapa dentro dos baús c03, c05 e c09 | 1 joia | z6, m11 |
| m11 | A Maré Baixa | m10 | npc_tito | Resolver o puzzle de comportas (o mapa completo mostra onde ficam) e drenar a caverna | 40 moedas | Salas internas |
| m12 | A Procura pelo Tentáculo | m11 | npc_anselmo | Correr ao longo do tentáculo gigante, achar o que há de estranho (caracóis parasitas) e contar ao Dr. Anselmo | XP e Chave da sala do chefe | Sala do chefe |
| m13 | O Guardião da Caverna | m12 | npc_anselmo | Vencer o Tentáculo-Guardião | Amuleto da Maré (equipamento exclusivo), 3 joias | Fim da história da ilha |
| m14 | De Volta ao Porto | m13 | npc_nara | Entregar a Escama do Guardião (baú c10) | Mapa da próxima ilha | Navio (próxima ilha) |

Observações:
- A coluna "Libera" segue a regra de liberação da seção 7.1: zonas (z2–z6) abrem ao aceitar; o resto abre ao concluir.
- m05 tem 3 partes encadeadas com a mesma estrutura de uma missão em partes (cada parte tem objetivo e dica próprios).
- m09 exige m06 porque uma das marcas fica nas falésias (z5).
- m10: o pedaço do c03 está na praia, o do c05 na ilhota (pede a chave do mini-chefe mb2 e o repelente da m08) e o do c09 na sala 1 da caverna, que é seca e abre ao aceitar a m10. A dica da m10 deve apontar para o Sapo-Ancestral se o jogador ainda não tiver a chave da ilhota.
- m12 é curta e sem combate. O jogador corre ao longo do tentáculo (trajeto marcado por checkpoints), o Dr. Anselmo conclui que os caracóis são parasitas e que o Guardião vem se coçar ali. XP e escala de joias estão em aberto (seção 12).

### 7.4 Baús

Tipos: `free` (abre na hora), `locked` (pede chave), `hidden` (pede puzzle ou escalada), `quest` (abre como recompensa). Abertura é por jogador.

| id | Local | Tipo | Como abrir | Conteúdo |
| --- | --- | --- | --- | --- |
| c01 | Porto, atrás do farol | free | `F` (libera em m02) | 20 moedas |
| c02 | Vila, telhado da loja | hidden | Escalar pelas caixas | 2 poções pequenas |
| c03 | Praia, gruta pequena | hidden | Passagem baixa (atravessar com esquiva) | 30 moedas, insígnia b01, pedaço de mapa |
| c04 | Pântano, tronco oco | free | `F` | Erva rara (ingrediente do repelente da m08) |
| c05 | Pântano, ilhota | locked | Chave do Sapo-Ancestral e repelente | Arma nível 2, pedaço de mapa |
| c06 | Falésias, cume | locked | Chave da m06 | Poção Heróica |
| c07 | Falésias, plataforma alta | hidden | Pulos cronometrados | 3 joias, insígnia b05 |
| c08 | Casa da Dona Iracema | quest | m06 | Receita de poção grande |
| c09 | Caverna, sala 1 | free | `F` | 25 moedas, pedaço de mapa |
| c10 | Caverna, pós-chefe | quest | Vencer o chefe | Escama do Guardião (prova da vitória para a m14), 2 joias |

O único coração extra da ilha vem da m06 (máximo de 4 corações). Por isso o c06 dá uma Poção Heróica. Isso difere do GDD, que listava coração extra nos dois.

Chaves e itens de missão (chave da Iracema, chave da ilhota, repelente, chave da sala do chefe, pedaços de mapa) nunca são consumidos ao uso: ficam no inventário e não podem ser vendidos nem descartados. A mesma chave da m06 abre a casa da Iracema e o c06.

### 7.5 Insígnias de exploração (8)

| id | Feito |
| --- | --- |
| b01 | Entrar na gruta da praia (c03) |
| b02 | Chegar ao topo do farol |
| b03 | Atravessar o pântano sem pisar na água |
| b04 | Achar a ilhota escondida |
| b05 | Concluir os pulos da plataforma alta (c07) |
| b06 | Chegar ao mirante das falésias |
| b07 | Encontrar as 3 marcas de ventosa (m09) |
| b08 | Derrubar o chefe sem tomar dano (nem meio coração) |

Moedas soltas: 30 na ilha (6 no porto, 6 na vila, 6 na praia, 6 no pântano, 6 nas falésias). A caverna não tem moedas soltas.

### 7.6 Inimigos

Vida do inimigo em pontos de golpe do Graveto Reforçado (1 por golpe). Dano em corações.

| id | Inimigo | Zona | HP | Dano | Comportamento | Drop principal |
| --- | --- | --- | --- | --- | --- | --- |
| e01 | Caranguejo Comum | z3 | 2 | 0,5 | Anda de lado e belisca de perto | Moeda, casca |
| e02 | Caranguejo Espinhoso | z3, z4 | 3 | 0,5 | Espinhos refletem golpe de frente; atacar pelas costas | Casca espinhosa |
| e03 | Mosquito do Pântano | z4 | 1 | 0,5 | Voa em círculos e mergulha | Ferrão |
| e04 | Sapo Gosmento | z4 | 4 | 1 | Pula e cospe gosma que deixa o jogador lento | Gosma |
| e05 | Água-viva da Caverna | z6 | 3 | 1 | Flutua, choque em área | Gel brilhante |
| mb1 | Caranguejo-Rei (mini-chefe) | z3 | 12 | 1 | 2 fases: investida e chuva de bolhas | 50 moedas |
| mb2 | Sapo-Ancestral (mini-chefe) | z4 | 14 | 1 | Pulos em área, invoca mosquitos | Chave da ilhota |

#### Chefe: Tentáculo-Guardião (id `boss1`)

Sala mais funda da caverna. Dura de 3 a 5 minutos. Nome e conceito podem mudar (seção 12).

| Fase | HP | Descrição |
| --- | --- | --- |
| 1 — Tentáculos soltos | 20 | 4 tentáculos batem no chão em padrões telegrafados. Cortar um abre janela de dano no núcleo |
| 2 — Maré sobe | 20 | A água enche a sala; pular entre plataformas. O chefe lança tinta que limita a visão |
| 3 — Fim da corda | 15 | Mais rápido, combina as fases anteriores. Atacar o olho central encerra a luta |

Recompensa: m13, c10 e a insígnia b08 se o jogador não tomar dano.

### 7.7 Itens, drops e loja

Total esperado: cerca de 330 moedas garantidas (sem contar drops comuns) e 9 joias.

| Item | Fonte | Chance | Uso |
| --- | --- | --- | --- |
| Moeda | Inimigos comuns | 60% (1–3 moedas, **proposta**) | Loja |
| Erva | Coletável no pântano (renasce) | — | Remédio da m05, poção pequena, poção grande |
| Casca de caranguejo | Caranguejos | 40% | Repelente |
| Casca espinhosa | Caranguejo Espinhoso | 25% | Armadura nível 1 |
| Ferrão | Mosquito | 35% | Poção |
| Gosma | Sapo Gosmento | 30% | Repelente |
| Gel brilhante | Água-viva | 30% | Poção grande |
| Coração pequeno | Qualquer inimigo comum (mini-chefes têm drop fixo) | 10% | Recupera meio coração |
| Erva rara | Baú c04 | 100% (1 vez) | Repelente (m08) |

Receitas da bancada do Zé Calango (quantidades **proposta**):

| Receita | Ingredientes | Como se obtém |
| --- | --- | --- |
| Repelente | 2 cascas de caranguejo, 1 gosma, 1 erva rara | Ensinada na m08 |
| Poção pequena | 1 ferrão, 1 erva | Recompensa da m08 |
| Poção grande | 2 géis brilhantes, 2 ervas | Baú c08 |

Loja do Seu Bento (liberada na m03):

| Item | Preço | Efeito |
| --- | --- | --- |
| Poção pequena | 15 moedas | Recupera 2 corações |
| Poção grande | 40 moedas | Recupera todos os corações |
| Poção Heróica | 1 joia | +2 corações temporários por 60 s (**proposta**) |
| Armadura nível 1 | 60 moedas e 3 cascas espinhosas | Reduz o dano em 0,5 coração |

Arma nível 2 só vem do baú c05. A loja aceita preço em itens além de moedas e joias (caso da armadura), então o schema de `shop.json` tem `custo: { moedas, joias, itens }`.

## 8. Formato do conteúdo (`packages/content`)

Arquivos: `zones.json`, `npcs.json`, `quests.json`, `chests.json`, `badges.json`, `enemies.json`, `items.json`, `recipes.json`, `shop.json`, `dialogues.pt-BR.json`. Cada um com schema zod em `schemas/` e um teste que carrega tudo e valida referências cruzadas (ex.: toda missão aponta para NPC e itens que existem).

Missão (exemplo):

```json
{
  "id": "m05",
  "titulo": "Remédio da Iracema",
  "npc": "npc_iracema",
  "requer": ["m03"],
  "partes": [
    { "objetivo": "collect", "item": "erva", "qtd": 3, "dica": "As ervas crescem perto da água parada." },
    { "objetivo": "kill", "inimigo": "e03", "qtd": 5, "dica": "Os mosquitos voam em círculos sobre o lodo." },
    { "objetivo": "talk", "npc": "npc_iracema" }
  ],
  "dialogo_entrada": "iracema_m05_intro",
  "dialogo_conclusao": "iracema_m05_fim",
  "recompensa": { "moedas": 30, "itens": ["pocao_heroica"] },
  "libera_ao_aceitar": ["z4"],
  "libera": []
}
```

Tipos de objetivo: `talk`, `collect`, `kill`, `reach` (checkpoint), `use` (objeto/puzzle), `defeat_boss`.

Baú (exemplo):

```json
{ "id": "c05", "zona": "z4", "tipo": "locked", "requer": ["chave_ilhota", "repelente"],
  "conteudo": { "itens": ["arma_nv2", "pedaco_mapa"], "moedas": 0, "joias": 0 } }
```

## 9. Milestones e critérios de aceite

### M0 — Esqueleto
- Monorepo com pnpm, TypeScript estrito, ESLint, Prettier, Vitest.
- `docker compose up` sobe Postgres e o servidor; `pnpm dev` sobe o cliente.
- Cliente abre uma cena three.js com chão e um cubo, conecta na sala `island` e mostra a contagem de jogadores.
- **Aceite:** abrir 2 abas mostra "2 jogadores"; CI roda lint, typecheck e testes.

### M1 — Personagem e câmera
- WASD, pulo, esquiva, câmera em terceira pessoa com colisão, personagem placeholder com máquina de estados e animações simples.
- Movimento sincronizado entre 2 clientes com interpolação e predição.
- **Aceite:** 2 abas veem uma à outra se movendo sem pulos visíveis a 100 ms de latência simulada; 60 fps em notebook comum.

### M2 — Interação, diálogo e missões
- Tecla `F`, ícone flutuante, caixa de diálogo, loader de `content` com validação, motor de missões (todos os tipos de objetivo), persistência em Postgres.
- **Aceite:** completar m01 e m02 de ponta a ponta; recarregar a página mantém o progresso; teste automático cobre o motor de missões.

### M3 — Combate, inimigos e loot
- Combo, golpe carregado, esquiva com invulnerabilidade, hitboxes, hit-stop, números de dano, IA dos inimigos e1–e5 no servidor, drops e inventário, HUD de corações, moedas e joias.
- **Aceite:** derrotar 8 caranguejos conclui m04 e os drops seguem as chances da tabela em 1000 simulações (tolerância de 5 pontos percentuais).

### M4 — Mundo e conteúdo (zonas 1–5)
- Greybox das zonas z1–z5 com colisão, baús (c01–c08), insígnias, moedas soltas, loja, crafting, mini-chefes mb1 e mb2, missões m01–m11 funcionais.
- **Aceite:** um jogador novo chega até m09 só seguindo diálogos e dicas; todos os baús abrem uma vez por jogador.

### M5 — Caverna e chefe
- Zona z6 com puzzle de comportas, tentáculo gigante com trajeto da m12, chefe `boss1` em 3 fases, missões m12–m14, baú c10, insígnia b08.
- **Aceite:** o chefe é derrotável por 1 e por 4 jogadores; a luta funciona com um jogador desconectando no meio.

### M6 — Casa-lobby, estilo e polimento
- Menu do navio (ilha ou casa), sala `home` com baú pessoal, toon shading com contorno, paleta cartoon colorida, áudio básico, tela de carregamento.
- **Aceite:** orçamento de performance da seção 10 atendido; jogo completo da ilha jogável de ponta a ponta.

## 10. Orçamento de performance e qualidade

- 60 fps em notebook comum e 30 fps em celular.
- Até 150 draw calls por zona; instancing para vegetação e caixas; luz baked no cenário e só 1 luz dinâmica.
- Carregamento por zona com streaming; tela inicial em menos de 5 s em banda larga.
- Teste de sala com 8 jogadores e 20 inimigos mantendo tick de 20 Hz.
- Servidor nunca confia em valores do cliente para dano, drop, moedas ou progresso.

## 11. Fora de escopo (por enquanto)

- Visitas de amigos à casa, decoração da casa, guildas, PvP, arena.
- Pagamento com dinheiro real, loja premium.
- Segunda ilha (só o navio e o mapa como gancho).
- Mobile com controles de toque (o desenho de UI deve permitir, mas não é entregável agora).

## 12. Questões em aberto

- Curva de XP e escala de joias (a wiki de referência paga valores muito maiores numa missão curta).
- Se o chefe hostil continua ou se vira uma missão de "salvar o Kraken", como na referência.
- Se a primeira ilha segue a Ilha do Kraken ou a primeira ilha real do jogo de referência.
- Estilo de arte detalhado: paleta, proporções do personagem, referências.
- Limite real de jogadores por instância (proposta: 8).

## 13. Furos de roteiro corrigidos na v0.3

O dono do projeto autorizou o Claude Code a decidir questões de lógica de roteiro e de missões. Decisões tomadas:

1. **4º coração:** vem só da m06. A seção 5 citava o baú 6 por engano.
2. **z2:** é liberada pela m01, não pela m03, porque a m01 já pede falar com Bento e Iracema na vila.
3. **Liberação de zonas:** acontece ao aceitar a missão, não ao concluir. Antes, m01, m04, m05, m06 e m10 tinham objetivos dentro da zona que elas mesmas liberavam.
4. **m09 exige m06:** uma das marcas fica nas falésias, que só abrem com a m06.
5. **m09/m10:** a m09 dá o mapa rasgado, e a m10 o completa. Antes a m09 já dava "Mapa da caverna", o que esvaziava a m10. O c09 fica na sala 1, seca. A drenagem da m11 só é necessária para as salas internas.
6. **Chaves não são consumidas:** a chave da m06 abre a casa e o c06.
7. **Erva rara ganhou função:** é o ingrediente especial do repelente da m08, já que só existe uma. Antes ela era ingrediente de uma receita repetível. A poção grande usa erva comum e gel brilhante.
8. **m08:** a recompensa deixou de ser o próprio repelente (que o jogador fabrica) e passou a ser a receita de poção pequena.
9. **Recompensas do chefe:** antes "equipamento exclusivo" aparecia duas vezes. Agora a m13 dá o Amuleto da Maré, e o c10 dá a Escama do Guardião, que é a prova pedida na m14.
10. **m04:** foi renomeada para "Praga de Caranguejos", porque o objetivo é na praia e não na horta.
11. **Escalar e passagens baixas:** são feitas com pulo e esquiva. Não há mecânica de escalada nem de agachar.
12. **b08:** "sem perder coração" passou a ser "sem tomar dano", alinhado com o campo `no_damage`.