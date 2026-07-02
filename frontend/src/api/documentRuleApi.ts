import {
  apiDeleteJson,
  apiGetJson,
  apiPatchJson,
  apiPostJson
} from "./apiClient";
import type { EvraklarPageStats, EvraklarRule } from "@/types";

export type CreateDocumentRulePayload = Omit<EvraklarRule, "id" | "createdAt">;
export type UpdateDocumentRulePayload = Partial<CreateDocumentRulePayload>;

export async function listDocumentRules(): Promise<EvraklarRule[]> {
  return apiGetJson<EvraklarRule[]>("/api/document-rules");
}

export async function getDocumentRuleStats(): Promise<EvraklarPageStats> {
  return apiGetJson<EvraklarPageStats>("/api/document-rules/stats");
}

export async function createDocumentRule(payload: CreateDocumentRulePayload): Promise<EvraklarRule> {
  return apiPostJson<EvraklarRule>("/api/document-rules", payload);
}

export async function updateDocumentRule(
  id: string,
  payload: UpdateDocumentRulePayload
): Promise<EvraklarRule> {
  return apiPatchJson<EvraklarRule>(`/api/document-rules/${encodeURIComponent(id)}`, payload);
}

export async function toggleDocumentRule(id: string): Promise<EvraklarRule> {
  return apiPatchJson<EvraklarRule>(`/api/document-rules/${encodeURIComponent(id)}/toggle`, {});
}

export async function deleteDocumentRule(id: string): Promise<void> {
  await apiDeleteJson<{ deleted: boolean }>(`/api/document-rules/${encodeURIComponent(id)}`);
}
