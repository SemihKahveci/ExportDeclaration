import { apiBaseUrl } from "@/config/appEnv";

export class ApiError extends Error {
  constructor(message: string, public status: number, public body?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try { return text ? (JSON.parse(text) as T) : ({} as T); }
  catch { throw new ApiError("Geçersiz JSON yanıtı", res.status, text); }
}

async function jsonRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${apiBaseUrl()}${path}`, { ...init, credentials: "include" });
  const data = await parseJson<{ ok?: boolean; error?: string; data?: T }>(res);
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? res.statusText, res.status, data);
  return (data as { data: T }).data;
}

export function apiGetJson<T>(path: string): Promise<T> {
  return jsonRequest<T>(path);
}
export function apiPostJson<T>(path: string, body?: unknown): Promise<T> {
  return jsonRequest<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: body !== undefined ? JSON.stringify(body) : undefined });
}
export function apiPatchJson<T>(path: string, body: unknown): Promise<T> {
  return jsonRequest<T>(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
export function apiPutJson<T>(path: string, body: unknown): Promise<T> {
  return jsonRequest<T>(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
export function apiPostMultipart<T>(path: string, form: FormData): Promise<T> {
  return jsonRequest<T>(path, { method: "POST", body: form });
}
export function apiDeleteJson<T>(path: string): Promise<T> {
  return jsonRequest<T>(path, { method: "DELETE" });
}
export async function apiGetBlob(path: string): Promise<Blob> {
  const res = await fetch(`${apiBaseUrl()}${path}`, { credentials: "include" });
  if (!res.ok) throw new ApiError((await res.text()) || res.statusText, res.status);
  return res.blob();
}
