import type { CellValue } from "exceljs";

/**
 * Converte o valor de uma célula do ExcelJS para texto plano, cobrindo os
 * formatos que uma planilha real (Excel/Google Sheets/LibreOffice) pode
 * produzir para uma célula que visualmente só tem texto simples:
 *
 * - string/number/boolean → conversão direta
 * - rich text (`{ richText: [...] }`) — célula com mais de um "run" de
 *   formatação (ex.: parte em negrito) vira isto em vez de string pura
 * - hyperlink (`{ text, hyperlink }`)
 * - fórmula (`{ formula, result }`) — usa o resultado calculado
 * - Date → ISO
 *
 * Bug real corrigido por isto: `String(cell.value)` num valor rich text
 * produz `"[object Object]"`, que nunca bate com nomes de coluna
 * esperados como "MEIO"/"PI" — mesmo a célula mostrando exatamente esse
 * texto no Excel. Ver skills.service.ts (import de planilha).
 */
export function cellToText(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();

  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((run) => run.text).join("");
    }
    if ("text" in value && typeof value.text === "string") {
      return value.text; // hyperlink
    }
    if ("result" in value) {
      return cellToText(value.result as CellValue); // fórmula — usa o valor calculado
    }
    if ("error" in value) {
      return ""; // célula com erro de fórmula (#REF!, #N/A...) — trata como vazia
    }
  }

  return String(value);
}
