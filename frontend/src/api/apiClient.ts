import { apiBaseUrl, companyId, userId } from "@/config/appEnv";

function authHeaders(): HeadersInit {
  const h: Record<string, string> = { "x-company-id": companyId() };
  const uid = userId();
  if (uid) h["x-user-id"] = uid;
  return h;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    throw new ApiError("Geçersiz JSON yanıtı", res.status, text);
  }
}

export async function apiGetJson<T>(path: string): Promise<T> {
  const res = await fetch(`${apiBaseUrl()}${path}`, { headers: { ...authHeaders() } });
  const data = await parseJson<{ ok?: boolean; error?: string; data?: T }>(res);
  if (!res.ok) {
    const msg = (data as { error?: string }).error ?? res.statusText;
    throw new ApiError(msg, res.status, data);
  }
  return (data as { data: T }).data;
}

export async function apiPostJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const data = await parseJson<{ ok?: boolean; error?: string; data?: T }>(res);
  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error ?? res.statusText, res.status, data);
  }
  return (data as { data: T }).data;
}

export async function apiPatchJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body)
  });
  const data = await parseJson<{ ok?: boolean; error?: string; data?: T }>(res);
  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error ?? res.statusText, res.status, data);
  }
  return (data as { data: T }).data;
}

export async function apiPostMultipart<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    method: "POST",
    headers: { ...authHeaders() },
    body: form
  });
  const data = await parseJson<{ ok?: boolean; error?: string; data?: T }>(res);
  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error ?? res.statusText, res.status, data);
  }
  return (data as { data: T }).data;
}

export async function apiGetBlob(path: string): Promise<Blob> {
  const res = await fetch(`${apiBaseUrl()}${path}`, { headers: { ...authHeaders() } });
  if (!res.ok) {
    const t = await res.text();
    throw new ApiError(t || res.statusText, res.status);
  }
  return res.blob();
}
