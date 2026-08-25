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
  invoiceParserTimeoutMs: num(process.env.INVOICE_PARSER_TIMEOUT_MS, 10 * 60 * 1000),
  licenseEnabled: bool(process.env.LICENSE_ENABLED, false),

  authJwtSecret: process.env.AUTH_JWT_SECRET ?? "dev-only-change-this-auth-secret-at-least-32-chars",
  authCookieName: process.env.AUTH_COOKIE_NAME ?? "export_decl_session",
  authSessionHours: num(process.env.AUTH_SESSION_HOURS, 12),
  superAdminEmail: process.env.SUPERADMIN_EMAIL ?? "",
  superAdminPassword: process.env.SUPERADMIN_PASSWORD ?? "",
  superAdminName: process.env.SUPERADMIN_NAME ?? "Süper Admin",
  superAdminCompanyId: process.env.SUPERADMIN_COMPANY_ID ?? "",
  superAdminResetPassword: bool(process.env.SUPERADMIN_RESET_PASSWORD, false),
  
  licenseFilePath:
    process.env.LICENSE_FILE_PATH ??
    path.join(process.cwd(), "licenses", "license.json"),

  licensePublicKeyPath:
    process.env.LICENSE_PUBLIC_KEY_PATH ??
    path.join(process.cwd(), "backend", "license", "public-key.pem"),

  installationIdPath:
    process.env.INSTALLATION_ID_PATH ??
    path.join(process.cwd(), "license-data", "installation-id.txt"),
    mailEnabled: bool(process.env.MAIL_ENABLED),

    smtpHost: process.env.SMTP_HOST ?? "",
    smtpPort: num(process.env.SMTP_PORT, 587),
    smtpSecure: bool(process.env.SMTP_SECURE),
    smtpUser: process.env.SMTP_USER ?? "",
    smtpPass: (process.env.SMTP_PASS ?? "").replace(/\s+/g, ""),

    mailFrom: process.env.MAIL_FROM ?? "",
    mailFromName: process.env.MAIL_FROM_NAME ?? "Export Declaration",
    newUserNotifyEmail: process.env.NEW_USER_NOTIFY_EMAIL ?? "serdarkahveci88@gmail.com",
} as const;
