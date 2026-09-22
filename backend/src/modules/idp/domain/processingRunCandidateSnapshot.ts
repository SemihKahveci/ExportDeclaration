import type { CandidateExtractionEnvelope } from "./candidateExtraction.types.js";
import type { FieldCandidate, FieldCandidateEnvelope } from "./fieldCandidate.types.js";

function isFieldCandidateEnvelope(value: unknown): value is FieldCandidateEnvelope {
  if (!value || typeof value !== "object") return false;
  const envelope = value as Partial<FieldCandidateEnvelope>;
  return envelope.version === "1" && !!envelope.fields && typeof envelope.fields === "object" && !Array.isArray(envelope.fields);
}

/**
 * Builds the declaration-facing candidate snapshot owned by one ProcessingRun.
 * The segment extraction envelope remains available for extractor audit, while
 * this flattened envelope is the only representation consumed by declaration
 * orchestration. No values are inferred here: only evidence-backed candidates
 * emitted by segment extractors are copied.
 */
export function buildProcessingRunCandidateSnapshot(extraction: CandidateExtractionEnvelope): FieldCandidateEnvelope {
  const fields: Record<string, FieldCandidate[]> = {};
  const candidateIds = new Set<string>();

  for (const segment of extraction.segments) {
    const fieldCandidates = segment.data?.fieldCandidates;
    if (!isFieldCandidateEnvelope(fieldCandidates)) continue;

    for (const [field, candidates] of Object.entries(fieldCandidates.fields)) {
      for (const candidate of candidates) {
        if (candidate.field !== field) {
          throw new Error(`Candidate ${candidate.candidateId} field mismatch: ${candidate.field} != ${field}`);
        }
        if (candidateIds.has(candidate.candidateId)) {
          throw new Error(`Duplicate declaration candidate id in ProcessingRun snapshot: ${candidate.candidateId}`);
        }
        candidateIds.add(candidate.candidateId);
        (fields[field] ??= []).push(candidate);
      }
    }
  }

  return { version: "1", fields };
}

export function isProcessingRunCandidateSnapshot(value: unknown): value is FieldCandidateEnvelope {
  return isFieldCandidateEnvelope(value);
}
