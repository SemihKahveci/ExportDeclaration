import { apiBaseUrl } from "@/config/appEnv";
import { ApiError, apiGetBlob, apiGetJson, apiPatchJson, apiPostJson } from "./apiClient";
import type { Declaration, OperationMeta, ValidationResult } from "@/api/types/declaration.types";

export type DeclarationListScope = "all" | "mine";

export async function listDeclarations(scope?: DeclarationListScope): Promise<Declaration[]> {
  const query = scope ? `?scope=${encodeURIComponent(scope)}` : "";
  return apiGetJson<Declaration[]>(`/api/declarations${query}`);
}

export async function listDeclarationParseStatuses(): Promise<Array<{ id: string; ref: string; name: string; status: string }>> {
  return apiGetJson("/api/declarations/parse-status");
}

export async function listDeclarationDocumentSummaries(): Promise<import("@/api/types/document.types").UploadedDocument[]> {
  return apiGetJson("/api/declarations/document-summaries");
}

export async function createDeclaration(body?: { operation?: Partial<OperationMeta> }): Promise<Declaration> {
  return apiPostJson<Declaration>("/api/declarations", body);
}

export async function getDeclaration(id: string): Promise<Declaration> {
  return apiGetJson<Declaration>(`/api/declarations/${encodeURIComponent(id)}`);
}

export async function patchDeclaration(
  id: string,
  body: Partial<Pick<Declaration, "normalizedData" | "status">> & { operation?: Partial<OperationMeta> }
) {
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

export async function downloadDeclarationExcel(id: string): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`${apiBaseUrl()}/api/declarations/${encodeURIComponent(id)}/exports/declaration-excel`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });
  if (!res.ok) throw new ApiError(res.statusText, res.status);
  const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "");
  return { blob: await res.blob(), filename: match?.[1] || "beyanname.xlsx" };
}

export async function transitionApprovalWorkflow(
  id: string,
  body: { action: "SET_SECOND_APPROVAL_REQUIRED"|"SAVE_NOTE"|"APPROVE"|"RETURN_TO_MT"; note?: string; requiresSecondApproval?: boolean }
): Promise<Declaration> {
  return apiPostJson<Declaration>(`/api/declarations/${encodeURIComponent(id)}/approval-workflow/transition`, body);
}

export async function transitionPreparationWorkflow(
 id:string,
 body:{action:"START_WRITING"|"START_WRITING_WITH_MISSING_DOCUMENTS";reason?:string;gtipDecision?:"continue"|"ask-customer"}
):Promise<{declaration:Declaration;readiness:{ready:boolean;documentCount:number;blockingDocumentCount:number;blockingDocuments:Array<{id:string;fileName:string;status:string}>}}>{
 return apiPostJson(`/api/declarations/${encodeURIComponent(id)}/preparation-workflow/transition`,body);
}

export async function transitionWritingWorkflow(
 id:string,body:{action:"SUBMIT_TO_MT"|"APPROVE_MT"|"RETURN_TO_WRITING";gtipDecision?:"continue"|"ask-customer";reason?:string}
):Promise<Declaration>{
 return apiPostJson<Declaration>(`/api/declarations/${encodeURIComponent(id)}/writing-workflow/transition`,body);
}

export async function transitionRegistrationWorkflow(
 id:string,body:{action:"RECORD_REGISTRATION_STARTED"|"COMPLETE_REGISTRATION";tescilNo?:string;line?:string}
):Promise<Declaration>{
 return apiPostJson<Declaration>(`/api/declarations/${encodeURIComponent(id)}/registration-workflow/transition`,body);
}

export async function transitionFileHold(
  id: string,
  body: { action: "HOLD" | "RESUME"; note?: string }
): Promise<Declaration> {
  return apiPostJson<Declaration>(`/api/declarations/${encodeURIComponent(id)}/hold`, body);
}

export async function transitionClosureWorkflow(
 id:string,body:{action:"CLOSE_FILE";note?:string}
):Promise<Declaration>{
 return apiPostJson<Declaration>(`/api/declarations/${encodeURIComponent(id)}/closure-workflow/transition`,body);
}
