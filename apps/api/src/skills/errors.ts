export interface SkillImportRowError {
  line: number;
  column: "ANALISTA" | "CLIENTE" | "MEIO" | "PI";
  value: string;
}

/**
 * Importação de habilidades (adendo Fase 2, item 6.3) — tudo ou nada: se
 * qualquer linha referenciar um cadastro inexistente, nada é gravado. O
 * relatório aponta linha e coluna/valor de cada problema para correção da
 * planilha antes de reenviar.
 */
export class SkillsImportValidationError extends Error {
  constructor(public readonly errors: SkillImportRowError[]) {
    super(`Planilha inválida: ${errors.length} erro(s) encontrado(s). Nenhuma linha foi gravada.`);
    this.name = "SkillsImportValidationError";
  }
}
