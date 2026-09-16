import { spawn } from "node:child_process";
import path from "node:path";
import { env } from "../../../config/env.js";
import type { CanonicalDocument, CanonicalLine, CanonicalWord } from "../domain/canonicalDocument.types.js";

interface OcrPageResult {
  pageNumber: number;
  words: CanonicalWord[];
  lines: CanonicalLine[];
  text: string;
}
interface OcrOutput { pages: OcrPageResult[]; }

export type OcrCheckpoint = (document: CanonicalDocument, completedPages: number[]) => Promise<void>;

function chunkPages(pageNumbers: number[], size: number): number[][] {
  const chunks: number[][] = [];
  for (let i = 0; i < pageNumbers.length; i += size) chunks.push(pageNumbers.slice(i, i + size));
  return chunks;
}

function parseJsonOutput(stdout: string, stderr: string): OcrOutput {
  const lines = stdout.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let lastError: unknown = null;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try { return JSON.parse(lines[i]!) as OcrOutput; } catch (error) { lastError = error; }
  }
  throw new Error(
    `OCR geçersiz JSON üretti: ${lastError instanceof Error ? lastError.message : String(lastError)}` +
    (stderr.trim() ? `; stderr: ${stderr.trim()}` : "")
  );
}

// Paddle inference is CPU-heavy. BullMQ job concurrency and OCR inference
// concurrency are intentionally separate: jobs may run concurrently, but only
// one Paddle subprocess is allowed to infer at a time in this worker process.
let ocrGate: Promise<void> = Promise.resolve();

async function withOcrSlot<T>(fn: () => Promise<T>): Promise<T> {
  const previous = ocrGate;
  let release!: () => void;
  ocrGate = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

function runOcrProcess(scriptPath: string, pdfPath: string, pageNumbers: number[]): Promise<OcrOutput> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const proc = spawn(
      env.invoiceParserPython,
      [scriptPath, pdfPath, "--pages", pageNumbers.join(",")],
      {
        cwd: path.dirname(scriptPath),
        env: {
          ...process.env,
          PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: "True",
          // Keep one Paddle process from consuming every host core. The IDP
          // worker may process multiple jobs concurrently.
          OCR_CPU_THREADS: process.env.OCR_CPU_THREADS ?? "2",
          // Keep BLAS/OpenMP helper pools single-threaded. Paddle itself is
          // controlled by its official cpu_threads inference parameter.
          OMP_NUM_THREADS: "1",
          OPENBLAS_NUM_THREADS: "1",
          MKL_NUM_THREADS: "1",
          NUMEXPR_NUM_THREADS: "1",
          OCR_MAX_RENDER_DIMENSION: process.env.OCR_MAX_RENDER_DIMENSION ?? "2400"
        },
        windowsHide: true,
        // On Linux this gives the OCR subprocess its own process group so a
        // timeout can terminate Paddle and any descendants as one unit.
        detached: process.platform !== "win32"
      }
    );

    let stdout = "";
    let stderr = "";
    let stderrBuffer = "";
    let settled = false;
    let idleTimer: NodeJS.Timeout;

    const killProcessTree = () => {
      if (proc.exitCode !== null || proc.signalCode !== null) return;
      try {
        if (process.platform !== "win32" && proc.pid) {
          process.kill(-proc.pid, "SIGKILL");
        } else {
          proc.kill("SIGKILL");
        }
      } catch {
        // The process may have exited between the state check and kill call.
      }
    };

    const finishReject = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(idleTimer);
      clearTimeout(totalTimer);
      killProcessTree();
      reject(error);
    };

    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        finishReject(new Error(
          `OCR ilerleme zaman aşımı (${env.ocrIdleTimeoutMs}ms); pages=${pageNumbers.join(",")}`
        ));
      }, env.ocrIdleTimeoutMs);
    };

    const logDiagnostic = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      resetIdleTimer();
      try {
        const event = JSON.parse(trimmed) as Record<string, unknown>;
        if (typeof event.event === "string") {
          console.log(JSON.stringify({ ...event, source: "paddleocr" }));
          return;
        }
      } catch { /* third-party diagnostic, keep as text */ }
      console.warn(JSON.stringify({ event: "idp.ocr.diagnostic", message: trimmed.slice(0, 2000) }));
    };

    const totalTimer = setTimeout(() => {
      finishReject(new Error(
        `OCR toplam zaman aşımı (${env.ocrTotalTimeoutMs}ms); pages=${pageNumbers.join(",")}`
      ));
    }, env.ocrTotalTimeoutMs);
    resetIdleTimer();

    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      stderrBuffer += text;
      const lines = stderrBuffer.split(/\r?\n/);
      stderrBuffer = lines.pop() ?? "";
      for (const line of lines) logDiagnostic(line);
    });

    proc.on("error", (error) => finishReject(error));
    proc.on("close", (code, signal) => {
      if (settled) return;
      if (stderrBuffer.trim()) logDiagnostic(stderrBuffer);
      clearTimeout(idleTimer);
      clearTimeout(totalTimer);
      settled = true;
      if (code !== 0) {
        reject(new Error(
          `OCR çıkış kodu ${code}${signal ? ` signal=${signal}` : ""}` +
          (stderr.trim() ? `: ${stderr.trim().slice(-8000)}` : "")
        ));
        return;
      }
      try {
        const result = parseJsonOutput(stdout, stderr);
        console.log(JSON.stringify({
          event: "idp.ocr.completed",
          pageCount: result.pages.length,
          durationMs: Date.now() - startedAt
        }));
        resolve(result);
      } catch (error) { reject(error); }
    });
  });
}

async function runOcr(scriptPath: string, pdfPath: string, pageNumbers: number[]): Promise<OcrOutput> {
  const queuedAt = Date.now();
  console.log(JSON.stringify({ event: "idp.ocr.waiting_for_slot", pages: pageNumbers }));
  return withOcrSlot(async () => {
    console.log(JSON.stringify({
      event: "idp.ocr.slot_acquired",
      pages: pageNumbers,
      waitMs: Date.now() - queuedAt
    }));
    return runOcrProcess(scriptPath, pdfPath, pageNumbers);
  });
}

function normalizeText(value: string): string {
  return value.toLocaleLowerCase("tr-TR").replace(/\s+/g, "").replace(/[^\p{L}\p{N}]/gu, "");
}

function intersectionOverUnion(a: CanonicalWord["bbox"], b: CanonicalWord["bbox"]): number {
  const x0 = Math.max(a.x0, b.x0), y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x1, b.x1), y1 = Math.min(a.y1, b.y1);
  const intersection = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  if (intersection <= 0) return 0;
  const areaA = Math.max(0, a.x1 - a.x0) * Math.max(0, a.y1 - a.y0);
  const areaB = Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
  const union = areaA + areaB - intersection;
  return union > 0 ? intersection / union : 0;
}

function isDuplicateOcrWord(ocrWord: CanonicalWord, nativeWords: CanonicalWord[]): boolean {
  const ocrText = normalizeText(ocrWord.text);
  if (!ocrText) return false;
  return nativeWords.some((nativeWord) => {
    const nativeText = normalizeText(nativeWord.text);
    const textMatches = nativeText === ocrText || nativeText.includes(ocrText) || ocrText.includes(nativeText);
    return textMatches && intersectionOverUnion(ocrWord.bbox, nativeWord.bbox) >= 0.35;
  });
}

export async function enrichCanonicalDocumentWithOcr(
  pdfPath: string,
  document: CanonicalDocument,
  checkpoint?: OcrCheckpoint
): Promise<CanonicalDocument> {
  // A persisted checkpoint is authoritative: retries skip pages that already
  // contain OCR output instead of throwing away completed Paddle work.
  const targetPages = document.pages
    .filter((page) =>
      (page.contentKind === "SCANNED" || page.contentKind === "MIXED") &&
      !page.ocrApplied
    )
    .map((page) => page.pageNumber);

  if (targetPages.length === 0) {
    console.log(JSON.stringify({ event: "idp.ocr.skipped", reason: "all_target_pages_already_enriched" }));
    return document;
  }

  const batchSize = Math.max(1, env.ocrBatchSize);
  const batches = chunkPages(targetPages, batchSize);
  console.log(JSON.stringify({
    event: "idp.ocr.started",
    pages: targetPages,
    batchSize,
    batchCount: batches.length
  }));

  const scriptPath = path.join(env.invoiceParserDir, "ocr_canonical_pages.py");

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batchPages = batches[batchIndex]!;
    console.log(JSON.stringify({
      event: "idp.ocr.batch.started",
      batchIndex: batchIndex + 1,
      batchCount: batches.length,
      pages: batchPages
    }));

    const result = await runOcr(scriptPath, pdfPath, batchPages);
    const byPage = new Map(result.pages.map((page) => [page.pageNumber, page]));

    for (const page of document.pages) {
      const ocr = byPage.get(page.pageNumber);
      if (!ocr) continue;

      // Defensive idempotency: a page must never receive the same OCR words twice.
      if (page.ocrApplied) continue;

      const nativeWords = page.words.filter((word) => word.source === "NATIVE_TEXT");
      const acceptedWords = page.contentKind === "MIXED"
        ? ocr.words.filter((word) => !isDuplicateOcrWord(word, nativeWords))
        : ocr.words;

      page.ocrApplied = true;
      page.ocrText = ocr.text;
      page.ocrWordCount = acceptedWords.length;
      page.words.push(...acceptedWords);
      page.lines.push(...ocr.lines);
    }

    // Recompute totals from canonical state rather than incrementing counters.
    // This keeps retry/resume and checkpoint replay idempotent.
    const enrichedPages = document.pages.filter((page) => page.ocrApplied);
    document.analysis.ocrPageCount = enrichedPages.length;
    document.analysis.ocrWordCount = enrichedPages.reduce(
      (sum, page) => sum + (page.ocrWordCount ?? 0),
      0
    );

    if (checkpoint) await checkpoint(document, batchPages);

    console.log(JSON.stringify({
      event: "idp.ocr.batch.completed",
      batchIndex: batchIndex + 1,
      batchCount: batches.length,
      pages: batchPages,
      persistedOcrPageCount: document.analysis.ocrPageCount,
      persistedOcrWordCount: document.analysis.ocrWordCount
    }));
  }

  return document;
}

