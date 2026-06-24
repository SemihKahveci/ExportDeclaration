import dotenv from "dotenv";
import path from "node:path";

dotenv.config();

const defaultParserDir = path.join(process.cwd(), "backend", "scripts", "invoice_parser");

function bool(v: string | undefined, fallback = false): boolean {
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function num(v: string | undefined, fallback: number): number {
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function splitCsv(v: string | undefined): string[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function defaultPythonBin(): string {
  return process.platform === "win32" ? "python" : "python3";
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: num(process.env.PORT, 3000),
  mongoUri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/export_declaration",
  uploadDir: process.env.UPLOAD_DIR ?? "uploads",
  jsonBodyLimit: process.env.JSON_BODY_LIMIT ?? "2mb",
  /**
   * Virgülle ayrılmış izinli kökler (CORS_ORIGIN). Boş dizi → `origin: true`.
   * Eski anahtar CORS_ORIGINS hâlâ okunur (geriye dönük).
   */
  corsAllowedOrigins: splitCsv(process.env.CORS_ORIGIN ?? process.env.CORS_ORIGINS),

  /** Python fatura parser (PaddleOCR / PyMuPDF) */
  invoiceParserEnabled: bool(process.env.INVOICE_PARSER_ENABLED),
  invoiceParserPython: process.env.INVOICE_PARSER_PYTHON ?? defaultPythonBin(),
  invoiceParserDir: process.env.INVOICE_PARSER_DIR ?? defaultParserDir,
  invoiceParserTimeoutMs: num(process.env.INVOICE_PARSER_TIMEOUT_MS, 10 * 60 * 1000)
} as const;
