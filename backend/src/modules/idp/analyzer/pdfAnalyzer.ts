import { spawn } from "node:child_process";
import path from "node:path";
import { env } from "../../../config/env.js";
import type { DocumentDoc } from "../../documents/document.model.js";
import type { CanonicalDocument } from "../domain/canonicalDocument.types.js";

interface AnalyzerOutput {
  analysis: CanonicalDocument["analysis"];
  pages: CanonicalDocument["pages"];
}

function runAnalyzer(scriptPath: string, pdfPath: string): Promise<AnalyzerOutput> {
  return new Promise((resolve, reject) => {
    const proc = spawn(env.invoiceParserPython, [scriptPath, pdfPath], {
      cwd: path.dirname(scriptPath),
      env: process.env,
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`PDF analyzer zaman aşımı (${env.invoiceParserTimeoutMs}ms)`));
    }, env.invoiceParserTimeoutMs);

    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on("error", (error) => { clearTimeout(timer); reject(error); });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`PDF analyzer çıkış kodu ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
        return;
      }
      const output = stdout.trim();
      if (!output) {
        reject(new Error(`PDF analyzer boş çıktı üretti${stderr ? `: ${stderr.trim()}` : ""}`));
        return;
      }

      // Bazı native PDF kütüphaneleri stdout'a warning yazabiliyor.
      // Analyzer JSON'u tek satır olarak üretir; sondan başlayarak geçerli JSON satırını bul.
      const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      let parseError: unknown = null;

      for (let i = lines.length - 1; i >= 0; i -= 1) {
        try {
          resolve(JSON.parse(lines[i]!) as AnalyzerOutput);
          return;
        } catch (error) {
          parseError = error;
        }
      }

      reject(
        new Error(
          `PDF analyzer geçersiz JSON üretti: ${
            parseError instanceof Error ? parseError.message : String(parseError)
          }${stderr ? `; stderr: ${stderr.trim()}` : ""}`
        )
      );
    });
  });
}

export async function analyzePdfPath(
  filePath: string,
  source: CanonicalDocument["source"] = {}
): Promise<CanonicalDocument> {
  const scriptPath = path.join(env.invoiceParserDir, "analyze_pdf.py");
  const result = await runAnalyzer(scriptPath, filePath);

  return {
    schemaVersion: "1.0",
    source,
    analysis: result.analysis,
    pages: result.pages
  };
}

export async function analyzeUploadedPdf(file: DocumentDoc): Promise<CanonicalDocument | null> {
  const filePath = file.filePath ?? "";
  const mime = (file.mimeType ?? "").toLowerCase();
  const isPdf = mime.includes("pdf") || filePath.toLowerCase().endsWith(".pdf");
  if (!isPdf || !filePath) return null;

  return analyzePdfPath(filePath, {
    fileName: file.fileName,
    mimeType: file.mimeType,
    sha256: file.sha256
  });
}
