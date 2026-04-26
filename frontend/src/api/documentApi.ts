import { apiGetJson, apiPostMultipart } from "./apiClient";
import type { DocumentType, UploadedDocument } from "@/types/document.types";

export async function listDocuments(declarationId: string): Promise<UploadedDocument[]> {
  return apiGetJson<UploadedDocument[]>(`/api/declarations/${encodeURIComponent(declarationId)}/documents`);
}

export async function uploadDocument(declarationId: string, file: File, type: DocumentType): Promise<UploadedDocument> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("type", type);
  return apiPostMultipart<UploadedDocument>(
    `/api/declarations/${encodeURIComponent(declarationId)}/documents`,
    fd
  );
}
