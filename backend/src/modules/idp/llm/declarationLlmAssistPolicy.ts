import type { DeclarationCrossDocumentConsistencyResult } from "../domain/declarationCrossDocumentConsistency.types.js";
import type {
  DeclarationLlmAssistField,
  DeclarationLlmAssistRequest,
  DeclarationLlmAssistResponse
} from "../domain/declarationLlmAssist.types.js";
import { DeclarationLlmAssistDecision } from "../domain/declarationLlmAssist.types.js";

export const DeclarationLlmAssistPolicyDecision = {
  SKIP_READY: "SKIP_READY",
  SKIP_NO_GROUNDED_CONFLICT: "SKIP_NO_GROUNDED_CONFLICT",
  ALLOW_GROUNDED_CONFLICT: "ALLOW_GROUNDED_CONFLICT"
} as const;

export type DeclarationLlmAssistPolicyDecisionValue =
  (typeof DeclarationLlmAssistPolicyDecision)[keyof typeof DeclarationLlmAssistPolicyDecision];

export function decideDeclarationLlmAssistPolicy(
  consistency: DeclarationCrossDocumentConsistencyResult
): DeclarationLlmAssistPolicyDecisionValue {
  if (consistency.status === "CONSISTENT") return DeclarationLlmAssistPolicyDecision.SKIP_READY;

  const hasGroundedConflict = consistency.fields.some(
    (field) => field.status === "CONFLICT" && field.observations.length >= 2
  );
  return hasGroundedConflict
    ? DeclarationLlmAssistPolicyDecision.ALLOW_GROUNDED_CONFLICT
    : DeclarationLlmAssistPolicyDecision.SKIP_NO_GROUNDED_CONFLICT;
}

export function buildDeclarationLlmAssistRequest(input: {
  companyId: string;
  declarationId: string;
  consistency: DeclarationCrossDocumentConsistencyResult;
}): DeclarationLlmAssistRequest {
  if (decideDeclarationLlmAssistPolicy(input.consistency) !== DeclarationLlmAssistPolicyDecision.ALLOW_GROUNDED_CONFLICT) {
    throw new Error("Declaration LLM assistance requires at least one grounded cross-document conflict.");
  }

  const fields: DeclarationLlmAssistField[] = input.consistency.fields
    .filter((field) => field.status === "CONFLICT")
    .map((field) => ({
      field: field.field,
      candidates: field.observations.map((observation) => ({
        candidateId: observation.candidateId,
        field: field.field,
        documentType: observation.documentType,
        logicalDocumentId: observation.logicalDocumentId,
        uploadedFileId: observation.uploadedFileId,
        value: observation.value
      }))
    }));

  return {
    version: "1",
    task: "RESOLVE_DECLARATION_CONFLICTS",
    companyId: input.companyId,
    declarationId: input.declarationId,
    fields
  };
}

export function validateDeclarationLlmAssistResponse(
  request: DeclarationLlmAssistRequest,
  response: DeclarationLlmAssistResponse
): DeclarationLlmAssistResponse {
  if (response.version !== "1") throw new Error("Declaration LLM response version is invalid.");
  if (response.decision !== DeclarationLlmAssistDecision.RESOLVED && response.decision !== DeclarationLlmAssistDecision.REVIEW_REQUIRED) {
    throw new Error("Declaration LLM response decision is invalid.");
  }
  if (!Array.isArray(response.selections) || !Array.isArray(response.issues)) {
    throw new Error("Declaration LLM response contract is incomplete.");
  }

  if (response.decision === DeclarationLlmAssistDecision.REVIEW_REQUIRED) {
    if (response.selections.length !== 0) throw new Error("REVIEW_REQUIRED cannot contain selections.");
    return response;
  }

  if (response.selections.length !== request.fields.length) {
    throw new Error("Declaration LLM must resolve every requested conflict field or require review.");
  }

  const seen = new Set<string>();
  for (const selection of response.selections) {
    if (seen.has(selection.field)) throw new Error(`Duplicate Declaration LLM selection for ${selection.field}.`);
    seen.add(selection.field);
    const field = request.fields.find((item) => item.field === selection.field);
    if (!field) throw new Error(`Declaration LLM selected an unrequested field: ${selection.field}.`);
    if (!field.candidates.some((candidate) => candidate.candidateId === selection.candidateId)) {
      throw new Error(`Declaration LLM selected an unknown candidateId for ${selection.field}.`);
    }
  }

  return response;
}
