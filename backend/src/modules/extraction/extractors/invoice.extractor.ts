import fs from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import { env } from "../../../config/env.js";
import type { DocumentTypeValue } from "../../../common/enums/documentType.js";
import type { ExtractedSource } from "../../normalization/normalizedDeclaration.types.js";
import { mapPythonInvoiceToExtracted } from "../python/invoiceParser.mapper.js";
import { runPythonInvoiceParser } from "../python/invoiceParser.runner.js";
import { extractFieldsFromInvoiceText } from "./invoiceTextHeuristics.js";

const emptyBlocks = () => ({
  header: {},
  parties: {},
  trade: {},
  transport: {},
  packageInfo: {},
  goodsLines: [] as unknown[]
});

async function extractInvoiceHeuristic(filePath: string): Promise<ExtractedSource["data"]> {
  const buf = await fs.readFile(filePath);
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
    ...parsed,
    extractMeta: {
      pdfTextChars: fullText.length,
      heuristic: true
    }
  };
}

/**
 * INVOICE: `INVOICE_PARSER_ENABLED=true` ise Python pipeline (OCR + GTİP + kalem çıkarımı).
 * Devre dışı veya hata durumunda pdf-parse + sezgisel kurallara düşer.
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

  if (env.invoiceParserEnabled) {
    try {
      const result = await runPythonInvoiceParser(filePath, {
        timeoutMs: env.invoiceParserTimeoutMs
      });
      return {
        type,
        data: mapPythonInvoiceToExtracted(result)
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Python parser hatası";
      const fallback = await extractInvoiceHeuristic(filePath);
      return {
        type,
        data: {
          ...fallback,
          extractMeta: {
            ...(typeof fallback.extractMeta === "object" && fallback.extractMeta !== null
              ? (fallback.extractMeta as Record<string, unknown>)
              : {}),
            pythonParser: false,
            pythonParserError: message,
            fallback: "heuristic"
          }
        }
      };
    }
  }

  return {
    type,
    data: await extractInvoiceHeuristic(filePath)
  };
}
