import { apiGetJson, apiPutJson } from "./apiClient";
import type { DeclarationApprovalRules } from "@/types";

export async function getDeclarationApprovalRules(): Promise<DeclarationApprovalRules> {
  return apiGetJson<DeclarationApprovalRules>("/api/declaration-approval-rules");
}

export async function saveDeclarationApprovalRules(
  rules: DeclarationApprovalRules
): Promise<DeclarationApprovalRules> {
  return apiPutJson<DeclarationApprovalRules>("/api/declaration-approval-rules", rules);
}
