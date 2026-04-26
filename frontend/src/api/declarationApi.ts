import { apiGetBlob, apiGetJson, apiPatchJson, apiPostJson } from "./apiClient";
import type { Declaration, ValidationResult } from "@/types/declaration.types";

export async function listDeclarations(): Promise<Declaration[]> {
  return apiGetJson<Declaration[]>("/api/declarations");
}

export async function createDeclaration(): Promise<Declaration> {
  return apiPostJson<Declaration>("/api/declarations");
}

export async function getDeclaration(id: string): Promise<Declaration> {
  return apiGetJson<Declaration>(`/api/declarations/${encodeURIComponent(id)}`);
}

export async function patchDeclaration(id: string, body: Partial<Pick<Declaration, "normalizedData" | "status">>) {
  return apiPatchJson<Declaration>(`/api/declarations/${encodeURIComponent(id)}`, body);
}

export async function extractDeclaration(id: string): Promise<unknown> {
  return apiPostJson<unknown>(`/api/declarations/${encodeURIComponent(id)}/extract`);
}

export async function normalizeDeclaration(id: string): Promise<Declaration> {
  return apiPostJson<Declaration>(`/api/declarations/${encodeURIComponent(id)}/normalize`);
}

export async function validateDeclaration(id: string): Promise<ValidationResult> {
  return apiPostJson<ValidationResult>(`/api/declarations/${encodeURIComponent(id)}/validate`);
}

export async function generateXml(id: string): Promise<{ path: string; declaration: Declaration }> {
  return apiPostJson<{ path: string; declaration: Declaration }>(
    `/api/declarations/${encodeURIComponent(id)}/generate-xml`
  );
}

export async function downloadXmlBlob(id: string): Promise<Blob> {
  return apiGetBlob(`/api/declarations/${encodeURIComponent(id)}/download-xml`);
}
