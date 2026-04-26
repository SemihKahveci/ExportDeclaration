import dotenv from "dotenv";

dotenv.config();

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
  corsAllowedOrigins: splitCsv(process.env.CORS_ORIGIN ?? process.env.CORS_ORIGINS)
} as const;
