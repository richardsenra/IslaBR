/**
 * Kit de teste: itens dados a quem entra na sala, para o dono do servidor
 * poder testar combate sem cumprir missão antes.
 *
 * Fica num módulo à parte, ligado só pelo `index.ts` a partir de uma variável
 * de ambiente. Os testes automáticos nunca o ligam, então um jogador novo
 * continua nascendo de mãos vazias lá.
 */
let kit: readonly string[] = [];

export function definirKitDeTeste(itens: readonly string[]): void {
  kit = itens;
}

export function kitDeTeste(): readonly string[] {
  return kit;
}

let zonasAbertas = false;

/** Abre todas as zonas para todo mundo (ISLABR_ZONAS_ABERTAS), para testar sem cumprir missão. */
export function definirZonasAbertas(abertas: boolean): void {
  zonasAbertas = abertas;
}

export function todasAsZonasAbertas(): boolean {
  return zonasAbertas;
}
