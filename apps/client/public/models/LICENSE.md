# Modelos 3D desta pasta

Personagens e animações do **KayKit Character Pack**, de Kay Lousberg
(<https://kaylousberg.com>), distribuídos sob **CC0 1.0 Universal** (domínio
público): <https://creativecommons.org/publicdomain/zero/1.0/>

O crédito não é obrigatório pela licença, mas fica registrado aqui de propósito.

## Arquivos

| Arquivo | Uso |
| --- | --- |
| `Rogue.glb` | Boneco do jogador |
| `Ranger.glb`, `Barbarian.glb`, `Mage.glb` | Capitã Nara, Seu Bento e Dona Iracema |
| `Knight.glb`, `Rogue_Hooded.glb` | Reserva para os outros NPCs e para distinguir jogadores |
| `Rig_Medium_General.glb` | Clipes de parado, dano e morte |
| `Rig_Medium_MovementBasic.glb` | Clipes de correr e pular |
| `Rig_Medium_MovementAdvanced.glb` | Clipes de esquiva |

Os seis personagens compartilham o mesmo esqueleto de 23 ossos das bibliotecas
de animação, então qualquer clipe toca em qualquer um deles sem retarget.

## Enquanto isso

São **placeholders**, como manda a SPEC §0: arte medieval de fantasia num jogo
de ilha tropical. Quando houver arte própria, a troca mexe só em
`apps/client/src/models.ts` e nesta pasta — o resto do cliente não sabe de que
modelo o boneco veio.
