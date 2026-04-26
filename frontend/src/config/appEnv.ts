/**
 * Tek giriş noktası: Vite ortam değişkenleri ve türetilmiş URL'ler.
 * Yeni VITE_* eklendiğinde önce buraya, sonra vite-env.d.ts'e yazın.
 *
 * VITE_COMPANY_ID: build çıktısına gömülür; tarayıcıda herkes görebilir (gizli anahtar değildir).
 * Yetkilendirme sunucuda (JWT/oturum + firma üyeliği) yapılmalıdır; sprint-1 modeli header ile bağlam içindir.
 */
const defaultApiBaseSsr = "http://localhost:3000";

function normalizeApiBase(raw: string | undefined): string {
  const trimmed = raw?.trim();
  let base =
    trimmed && trimmed !== ""
      ? trimmed.replace(/\/$/, "")
      : typeof window !== "undefined"
        ? ""
        : defaultApiBaseSsr;
  if (base.endsWith("/api")) {
    base = base.slice(0, -4);
  }
  return base;
}

export function apiBaseUrl(): string {
  return normalizeApiBase(import.meta.env.VITE_API_BASE);
}

export function companyId(): string {
  const id = import.meta.env.VITE_COMPANY_ID?.trim();
  if (!id) {
    throw new Error("VITE_COMPANY_ID tanımlı değil (frontend .env veya CI/build ortam değişkenleri).");
  }
  return id;
}

export function userId(): string | undefined {
  const id = import.meta.env.VITE_USER_ID?.trim();
  return id || undefined;
}
