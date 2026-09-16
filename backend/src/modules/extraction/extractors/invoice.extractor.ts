import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../../../config/env.js";
import type { DocumentTypeValue } from "../../../common/enums/documentType.js";
import type { ExtractedSource } from "../../normalization/normalizedDeclaration.types.js";
import { mapPythonInvoiceToExtracted } from "../python/invoiceParser.mapper.js";
import { runPythonInvoiceParser } from "../python/invoiceParser.runner.js";
import type { CanonicalDocument } from "../../idp/domain/canonicalDocument.types.js";

const emptyBlocks = () => ({
  header: {},
  parties: {},
  trade: {},
  transport: {},
  packageInfo: {},
  goodsLines: [] as unknown[]
});

/**
 * INVOICE candidate extraction consumes CanonicalDocument only.
 * OCR/PDF content extraction is owned by the IDP analyze/OCR stages.
 */
export async function extractInvoice(
  filePath: string,
  mimeType: string | undefined,
  options: { canonicalDocument: CanonicalDocument }
): Promise<ExtractedSource> {
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

  if (!env.invoiceParserEnabled) {
    throw new Error("Invoice candidate extractor devre dışı; INVOICE_PARSER_ENABLED=true gerekli.");
  }

  const result = await runPythonInvoiceParser(filePath, {
    timeoutMs: env.invoiceParserTimeoutMs,
    canonicalDocument: options.canonicalDocument
  });

  return {
    type,
    data: mapPythonInvoiceToExtracted(result)
  };
}
