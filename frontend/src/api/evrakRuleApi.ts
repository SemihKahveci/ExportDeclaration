import {
  apiDeleteJson,
  apiGetJson,
  apiPatchJson,
  apiPostJson
} from "./apiClient";
import type { EvraklarPageStats, EvraklarRule } from "@/types";

export type CreateEvrakRulePayload = Omit<EvraklarRule, "id" | "createdAt">;
export type UpdateEvrakRulePayload = Partial<CreateEvrakRulePayload>;

export async function listEvrakRules(): Promise<EvraklarRule[]> {
  return apiGetJson<EvraklarRule[]>("/api/evrak-rules");
}

export async function getEvrakRuleStats(): Promise<EvraklarPageStats> {
  return apiGetJson<EvraklarPageStats>("/api/evrak-rules/stats");
}

export async function createEvrakRule(payload: CreateEvrakRulePayload): Promise<EvraklarRule> {
  return apiPostJson<EvraklarRule>("/api/evrak-rules", payload);
}

export async function updateEvrakRule(id: string, payload: UpdateEvrakRulePayload): Promise<EvraklarRule> {
  return apiPatchJson<EvraklarRule>(`/api/evrak-rules/${encodeURIComponent(id)}`, payload);
}

export async function toggleEvrakRule(id: string): Promise<EvraklarRule> {
  return apiPatchJson<EvraklarRule>(`/api/evrak-rules/${encodeURIComponent(id)}/toggle`, {});
}

export async function deleteEvrakRule(id: string): Promise<void> {
  await apiDeleteJson<{ deleted: boolean }>(`/api/evrak-rules/${encodeURIComponent(id)}`);
}
