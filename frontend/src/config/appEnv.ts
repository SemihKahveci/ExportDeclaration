/** Vite ortam değişkenleri ve API kökü. */
const defaultApiBaseSsr = "http://localhost:3000";

function normalizeApiBase(raw: string | undefined): string {
  const trimmed = raw?.trim();
  let base = trimmed && trimmed !== ""
    ? trimmed.replace(/\/$/, "")
    : typeof window !== "undefined" ? "" : defaultApiBaseSsr;
  if (base.endsWith("/api")) base = base.slice(0, -4);
  return base;
}

export function apiBaseUrl(): string {
  return normalizeApiBase(import.meta.env.VITE_API_BASE);
}
