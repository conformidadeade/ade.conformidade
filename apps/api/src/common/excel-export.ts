import * as ExcelJS from "exceljs";
import { Response } from "express";

export interface ExcelExportColumn {
  header: string;
  key: string;
  width?: number;
}

/**
 * Exportação tabular simples (item 4) — sem fórmulas, pronta para uso em
 * planilha. `rows` é indexado pelas mesmas `key` das colunas.
 */
export async function writeSimpleExcel(
  res: Response,
  opts: { filename: string; sheetName: string; columns: ExcelExportColumn[]; rows: Record<string, unknown>[] },
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(opts.sheetName);
  sheet.columns = opts.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 20 }));
  sheet.addRows(opts.rows);
  sheet.getRow(1).font = { bold: true };

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${opts.filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}
