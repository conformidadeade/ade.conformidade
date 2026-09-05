import PDFDocument from "pdfkit";
import { Response } from "express";

export interface PdfExportColumn {
  header: string;
  width: number;
}

/**
 * Relatório tabular simples em PDF (item 4) — cabeçalho com nome e data
 * de geração, tabela paginada quando necessário. Não replica o layout
 * visual da tela, só precisa ser legível.
 */
export function writeSimpleTablePdf(
  res: Response,
  opts: { title: string; filename: string; columns: PdfExportColumn[]; rows: string[][] },
): void {
  const doc = new PDFDocument({ margin: 36, size: "A4", layout: "landscape" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${opts.filename}"`);
  doc.pipe(res);

  const startX = doc.page.margins.left;
  const rowHeight = 16;
  let y = doc.page.margins.top;

  function drawHeaderRow() {
    let x = startX;
    doc.font("Helvetica-Bold").fontSize(8);
    for (const col of opts.columns) {
      doc.text(col.header, x, y, { width: col.width, ellipsis: true });
      x += col.width;
    }
    y += rowHeight;
    doc
      .moveTo(startX, y - 4)
      .lineTo(x, y - 4)
      .strokeColor("#cccccc")
      .stroke();
    doc.font("Helvetica").fontSize(8);
  }

  doc.font("Helvetica-Bold").fontSize(14).text(opts.title, startX, y);
  y += 20;
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#666666")
    .text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, startX, y);
  y += 20;
  doc.fillColor("#000000");

  drawHeaderRow();
  for (const row of opts.rows) {
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeaderRow();
    }
    let x = startX;
    for (let i = 0; i < opts.columns.length; i++) {
      doc.text(row[i] ?? "", x, y, { width: opts.columns[i]!.width, ellipsis: true });
      x += opts.columns[i]!.width;
    }
    y += rowHeight;
  }

  doc.end();
}
