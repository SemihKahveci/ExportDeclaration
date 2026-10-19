import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Append one NDJSON diagnostic line under UPLOAD_DIR so docker compose logs
 * that scroll away still leave a durable host-visible trail.
 */
export function appendIdpRuntimeDiag(event: string, payload: Record<string, unknown> = {}): void {
  try {
    const root = process.env.UPLOAD_DIR?.trim() || path.resolve(process.cwd(), "uploads");
    mkdirSync(root, { recursive: true });
    const filePath = path.join(root, "idp-runtime-diag.ndjson");
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      event,
      ...payload
    });
    appendFileSync(filePath, `${line}\n`, "utf8");
  } catch {
    // Diagnostics must never break extraction.
  }
}
