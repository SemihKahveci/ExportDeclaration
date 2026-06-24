import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { env } from "../../config/env.js";
import { runPythonInvoiceParser } from "../extraction/python/invoiceParser.runner.js";
import {
  mapPythonInvoiceToGtipQueryResults,
  type GtipQueryResultDto
} from "./gtipQuery.mapper.js";

async function removeDirQuiet(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

export async function parseInvoicePdfForGtipQuery(
  file: Express.Multer.File
): Promise<{
  fileName: string;
  pdfType: string;
  itemCount: number;
  results: GtipQueryResultDto[];
}> {
  const mime = file.mimetype?.toLowerCase() ?? "";
  const ext = path.extname(file.originalname ?? "").toLowerCase();
  if (!mime.includes("pdf") && ext !== ".pdf") {
    throw new HttpError(400, "Yalnızca PDF dosyası yüklenebilir.");
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "gtip-query-"));
  const safeName = path.basename(file.originalname || "invoice.pdf");
  const pdfPath = path.join(workDir, safeName);

  try {
    await fs.writeFile(pdfPath, file.buffer);

    const parsed = await runPythonInvoiceParser(pdfPath, {
      timeoutMs: env.invoiceParserTimeoutMs
    });

    const results = mapPythonInvoiceToGtipQueryResults(parsed);
    return {
      fileName: safeName,
      pdfType: parsed.pdfType,
      itemCount: parsed.itemCount,
      results
    };
  } finally {
    await removeDirQuiet(workDir);
  }
}
