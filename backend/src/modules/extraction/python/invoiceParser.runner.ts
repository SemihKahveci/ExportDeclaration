import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { env } from "../../../config/env.js";
import type { CanonicalDocument } from "../../idp/domain/canonicalDocument.types.js";

export interface PythonInvoiceItem {
  lineNo?: number;
  productCode?: string | null;
  currency?: string;
  deliveryTerm?: string;
  transportMode?: string;
  quantity?: string;
  unit?: string;
  unitPrice?: string;
  amount?: string;
  needsReview?: boolean;
  description?: string;
  gtip?: string;
  rawLine?: string;
  boxes?: Record<string, unknown>;
  source?: Record<string, unknown>;
}

export interface PythonInvoiceResult {
  pdfType: string;
  inputFile: string;
  itemCount: number;
  items: PythonInvoiceItem[];
  extractionSource?: "CANONICAL_DOCUMENT";
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

function runProcess(
  pythonBin: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(pythonBin, args, {
      cwd,
      env: process.env,
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`Python invoice parser zaman aşımı (${timeoutMs}ms)`));
    }, timeoutMs);

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          `Python invoice parser çıkış kodu ${code}${stderr ? `: ${stderr.trim()}` : ""}`
        )
      );
    });
  });
}

/**
 * PDF faturayı Python pipeline ile parse eder.
 * `run_invoice.py` stdout'a özet JSON basar; asıl sonuç `--output` dosyasından okunur.
 */
export async function runPythonInvoiceParser(
  pdfPath: string,
  options: { canonicalDocument: CanonicalDocument; annotate?: boolean; timeoutMs?: number }
): Promise<PythonInvoiceResult> {
  const scriptDir = env.invoiceParserDir;
  const pythonBin = env.invoiceParserPython;
  const scriptPath = path.join(scriptDir, "run_invoice.py");
  const scriptCwd = path.dirname(scriptPath);

  try {
    await fs.access(scriptPath);
  } catch {
    throw new Error(`Invoice parser script bulunamadı: ${scriptPath}`);
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "invoice-parse-"));
  const outputJson = path.join(workDir, "invoice_result.json");

  const args = [scriptPath, pdfPath, "--output", outputJson, "--debug-dir", workDir];

  // Candidate extraction consumes the CanonicalDocument for every PDF type.
  // PDF reading/OCR belongs exclusively to the IDP analyze/OCR stages.
  const canonicalInput = path.join(workDir, "canonical_document.json");
  await fs.writeFile(canonicalInput, JSON.stringify(options.canonicalDocument), "utf-8");
  args.push("--canonical-input", canonicalInput);
  console.log(JSON.stringify({
    event: "idp.candidate_extract.canonical_input",
    contentKind: options.canonicalDocument.analysis.contentKind,
    pageCount: options.canonicalDocument.analysis.pageCount,
    ocrPageCount: options.canonicalDocument.analysis.ocrPageCount ?? 0,
    ocrWordCount: options.canonicalDocument.analysis.ocrWordCount ?? 0
  }));

  if (options.annotate) {
    args.push("--annotate", "--annotated-output", path.join(workDir, "annotated_invoice.pdf"));
  }

  await runProcess(pythonBin, args, scriptCwd, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const raw = await fs.readFile(outputJson, "utf-8");
  return JSON.parse(raw) as PythonInvoiceResult;
}
