import { resolveCrossDocumentField } from "./crossDocumentFieldResolver.js";
import type { CrossDocumentFieldRule } from "./crossDocumentFieldResolution.types.js";
import type { DeclarationFieldCandidate } from "./declarationFieldCandidate.types.js";
import type {
  DeclarationFieldResolutionEnvelope,
  ResolveDeclarationFieldsParams,
  ResolvedDeclarationField,
  DeclarationCandidateAuthoritySelection
} from "./declarationFieldResolution.types.js";

function assertUniqueCandidateIds(candidates: DeclarationFieldCandidate[]): void {
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.candidateId)) {
      throw new Error(`Duplicate declaration candidate id: ${candidate.candidateId}`);
    }
    seen.add(candidate.candidateId);
  }
}

/**
 * Resolves declaration-wide candidates without dropping their logical-document,
 * physical-file, ProcessingRun or evidence provenance. Authority is opt-in per
 * field; the absence of a rule can never create implicit document precedence.
 */
export function resolveDeclarationFields(
  params: ResolveDeclarationFieldsParams
): DeclarationFieldResolutionEnvelope {
  const ruleByField = new Map<string, CrossDocumentFieldRule>();
  for (const rule of params.rules ?? []) {
    if (ruleByField.has(rule.field)) throw new Error(`Duplicate authority rule for field: ${rule.field}`);
    ruleByField.set(rule.field, rule);
  }

  const selectionByField = new Map<string, DeclarationCandidateAuthoritySelection>();
  for (const selection of params.candidateSelections ?? []) {
    if (selectionByField.has(selection.field)) throw new Error(`Duplicate candidate authority selection for field: ${selection.field}`);
    selectionByField.set(selection.field, selection);
  }

  const fields: Record<string, ResolvedDeclarationField> = {};
  const reviewRequiredFields: string[] = [];

  for (const field of Object.keys(params.candidates.fields).sort()) {
    const candidates = params.candidates.fields[field] ?? [];
    assertUniqueCandidateIds(candidates);

    const explicitSelection = selectionByField.get(field);
    const explicitlySelectedCandidate = explicitSelection
      ? candidates.find((candidate) => candidate.candidateId === explicitSelection.candidateId)
      : undefined;
    if (explicitSelection && !explicitlySelectedCandidate) {
      throw new Error(`Candidate authority selection ${explicitSelection.candidateId} is missing from field ${field}.`);
    }

    const resolution = explicitlySelectedCandidate
      ? {
          field,
          status: "RESOLVED" as const,
          method: "EXPLICIT_CANDIDATE_AUTHORITY" as const,
          value: explicitlySelectedCandidate.value,
          selectedCandidateId: explicitlySelectedCandidate.candidateId,
          candidateIds: candidates.map((candidate) => candidate.candidateId),
          conflict: new Set(candidates.map((candidate) => JSON.stringify(candidate.value))).size > 1,
          conflictCandidateIds: candidates.filter((candidate) => candidate.candidateId !== explicitlySelectedCandidate.candidateId).map((candidate) => candidate.candidateId)
        }
      : resolveCrossDocumentField(field, candidates, ruleByField.get(field));
    const selectedCandidate = resolution.selectedCandidateId
      ? candidates.find((candidate) => candidate.candidateId === resolution.selectedCandidateId)
      : undefined;

    if (resolution.selectedCandidateId && !selectedCandidate) {
      throw new Error(`Resolved candidate ${resolution.selectedCandidateId} is missing from field ${field}.`);
    }

    fields[field] = {
      ...resolution,
      selectedCandidate,
      candidates: candidates.slice()
    };
    if (resolution.status === "REVIEW_REQUIRED") reviewRequiredFields.push(field);
  }

  for (const selection of params.candidateSelections ?? []) {
    if (!Object.prototype.hasOwnProperty.call(params.candidates.fields, selection.field)) {
      throw new Error(`Candidate authority selection references unknown field: ${selection.field}.`);
    }
  }

  return {
    version: "1",
    companyId: params.candidates.companyId,
    declarationId: params.candidates.declarationId,
    fields,
    reviewRequiredFields
  };
}
