import {
  apiDeleteJson,
  apiGetJson,
  apiPatchJson,
  apiPostJson
} from "./apiClient";
import type { DocProcess } from "@/types";

export type CreateDocumentProcessPayload = Omit<DocProcess, "id">;
export type UpdateDocumentProcessPayload = Partial<CreateDocumentProcessPayload>;

export async function listDocumentProcesses(): Promise<DocProcess[]> {
  return apiGetJson<DocProcess[]>("/api/document-processes");
}

export async function createDocumentProcess(
  payload: CreateDocumentProcessPayload
): Promise<DocProcess> {
  return apiPostJson<DocProcess>("/api/document-processes", payload);
}

export async function updateDocumentProcess(
  id: string,
  payload: UpdateDocumentProcessPayload
): Promise<DocProcess> {
  return apiPatchJson<DocProcess>(`/api/document-processes/${encodeURIComponent(id)}`, payload);
}

export async function deleteDocumentProcess(id: string): Promise<void> {
  await apiDeleteJson<{ deleted: boolean }>(`/api/document-processes/${encodeURIComponent(id)}`);
}
