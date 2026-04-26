import fs from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import type { DocumentTypeValue } from "../../../common/enums/documentType.js";
import type { ExtractedSource } from "../../normalization/normalizedDeclaration.types.js";
import { extractFieldsFromInvoiceText } from "./invoiceTextHeuristics.js";

const emptyBlocks = () => ({
  header: {},
  parties: {},
  trade: {},
  transport: {},
  packageInfo: {},
  goodsLines: [] as unknown[]
});

/**
 * INVOICE: PDF içinde metin katmanı varsa pdf-parse ile metin alınır ve sezgisel kurallarla alanlar doldurulur.
 * Taranmış / görüntü tabanlı PDF (OCR yok) için metin boş kalabilir — teknik doküman MVP sınırı.
 */
export async function extractInvoice(filePath: string, mimeType: string | undefined): Promise<ExtractedSource> {
  const type: DocumentTypeValue = "INVOICE";
  const ext = path.extname(filePath).toLowerCase();
  const looksPdf = Boolean(mimeType?.toLowerCase().includes("pdf") || ext === ".pdf");

  if (!looksPdf) {
    return {
      type,
      data: {
        ...emptyBlocks(),
        extractMeta: { reason: "non-pdf", hint: "INVOICE için şu an PDF metin çıkarımı destekleniyor." }
      }
    };
  }

  const buf = await fs.readFile(filePath);
  if (buf.length >= 4 && buf.subarray(0, 4).toString("ascii") !== "%PDF") {
    return {
      type,
      data: {
        ...emptyBlocks(),
        extractMeta: { reason: "not-pdf-binary" }
      }
    };
  }

  let fullText = "";
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const tr = await parser.getText();
    fullText = tr.text ?? "";
  } finally {
    await parser.destroy();
  }

  const parsed = extractFieldsFromInvoiceText(fullText);

  return {
    type,
    data: {
      ...parsed,
      extractMeta: {
        pdfTextChars: fullText.length,
        heuristic: true
      }
    }
  };
}
