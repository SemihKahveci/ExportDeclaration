import { resolveCrossDocumentField } from "./crossDocumentFieldResolver.js";
import type { CrossDocumentFieldRule } from "./crossDocumentFieldResolution.types.js";
import type { DeclarationFieldCandidate } from "./declarationFieldCandidate.types.js";
import type {
  DeclarationFieldResolutionEnvelope,
  ResolveDeclarationFieldsParams,
  ResolvedDeclarationField
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

  const fields: Record<string, ResolvedDeclarationField> = {};
  const reviewRequiredFields: string[] = [];

  for (const field of Object.keys(params.candidates.fields).sort()) {
    const candidates = params.candidates.fields[field] ?? [];
    assertUniqueCandidateIds(candidates);

    const resolution = resolveCrossDocumentField(field, candidates, ruleByField.get(field));
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

  return {
    version: "1",
    companyId: params.candidates.companyId,
    declarationId: params.candidates.declarationId,
    fields,
    reviewRequiredFields
  };
}
