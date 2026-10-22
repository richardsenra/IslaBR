import { getDialogue, getNpc } from '@islabr/content';
import type { DialoguePayload } from '@islabr/shared';

/**
 * Caixa de diálogo (SPEC §6). O servidor manda só o id da fala; o texto sai do
 * conteúdo, que o cliente também carrega. Até 3 caixas por fala (SPEC §7.2),
 * uma de cada vez, avançando com F.
 */
export class DialogueBox {
  private caixas: readonly string[] = [];
  private indice = 0;

  constructor(
    private readonly raiz: HTMLElement,
    private readonly quem: HTMLElement,
    private readonly texto: HTMLElement,
    private readonly rodape: HTMLElement,
  ) {
    this.fechar();
  }

  get aberta(): boolean {
    return this.caixas.length > 0;
  }

  abrir(payload: DialoguePayload): void {
    const dialogo = getDialogue(payload.dialogo);
    this.caixas = dialogo.caixas;
    this.indice = 0;
    this.quem.textContent = getNpc(dialogo.npc).nome;
    this.raiz.hidden = false;
    this.mostrar();
  }

  /** Avança uma caixa; devolve `true` se a fala continua aberta. */
  avancar(): boolean {
    if (!this.aberta) return false;
    this.indice += 1;
    if (this.indice >= this.caixas.length) {
      this.fechar();
      return false;
    }
    this.mostrar();
    return true;
  }

  fechar(): void {
    this.caixas = [];
    this.indice = 0;
    this.raiz.hidden = true;
  }

  private mostrar(): void {
    this.texto.textContent = this.caixas[this.indice] ?? '';
    const ultima = this.indice === this.caixas.length - 1;
    this.rodape.textContent = ultima ? 'F para fechar' : 'F para continuar';
  }
}
