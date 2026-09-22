import type {
  CrossDocumentFieldCandidate,
  CrossDocumentFieldRule,
  CrossDocumentResolution
} from "./crossDocumentFieldResolution.types.js";

function stableValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return `s:${value.trim()}`;
  if (typeof value === "number" || typeof value === "boolean") return `${typeof value}:${String(value)}`;
  return `j:${JSON.stringify(value)}`;
}

function uniqueValues(candidates: CrossDocumentFieldCandidate[]): Map<string, CrossDocumentFieldCandidate[]> {
  const groups = new Map<string, CrossDocumentFieldCandidate[]>();
  for (const candidate of candidates) {
    const key = stableValue(candidate.value);
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }
  return groups;
}

export function resolveCrossDocumentField(
  field: string,
  candidates: CrossDocumentFieldCandidate[],
  rule?: CrossDocumentFieldRule
): CrossDocumentResolution {
  const relevant = candidates.filter((candidate) => candidate.field === field);
  const candidateIds = relevant.map((candidate) => candidate.candidateId);
  if (relevant.length === 0) {
    return { field, status: "REVIEW_REQUIRED", method: "UNCONFIGURED_REVIEW", candidateIds, conflict: false, conflictCandidateIds: [], reason: "NO_CANDIDATE" };
  }

  const allValues = uniqueValues(relevant);
  if (allValues.size === 1) {
    const selected = relevant.slice().sort((a, b) => b.confidence - a.confidence || a.candidateId.localeCompare(b.candidateId))[0]!;
    return { field, status: "RESOLVED", method: "CONSENSUS", value: selected.value, selectedCandidateId: selected.candidateId, candidateIds, conflict: false, conflictCandidateIds: [] };
  }

  if (!rule || rule.field !== field || rule.authority.length === 0) {
    return { field, status: "REVIEW_REQUIRED", method: "UNCONFIGURED_REVIEW", candidateIds, conflict: true, conflictCandidateIds: candidateIds, reason: "CONFLICT_WITHOUT_AUTHORITY_RULE" };
  }

  const tiers = rule.authority.slice().sort((a, b) => a.priority - b.priority);
  for (const tier of tiers) {
    const authoritative = relevant.filter((candidate) => tier.documentTypes.includes(candidate.documentType));
    if (authoritative.length === 0) continue;
    const authoritativeValues = uniqueValues(authoritative);
    if (authoritativeValues.size !== 1) {
      return { field, status: "REVIEW_REQUIRED", method: "CONFLICT_REVIEW", candidateIds, conflict: true, conflictCandidateIds: authoritative.map((candidate) => candidate.candidateId), reason: "CONFLICT_WITHIN_AUTHORITY_TIER" };
    }
    const selected = authoritative.slice().sort((a, b) => b.confidence - a.confidence || a.candidateId.localeCompare(b.candidateId))[0]!;
    const conflictCandidateIds = relevant.filter((candidate) => stableValue(candidate.value) !== stableValue(selected.value)).map((candidate) => candidate.candidateId);
    return { field, status: "RESOLVED", method: "CONFIGURED_AUTHORITY", value: selected.value, selectedCandidateId: selected.candidateId, candidateIds, conflict: conflictCandidateIds.length > 0, conflictCandidateIds };
  }

  return { field, status: "REVIEW_REQUIRED", method: "UNCONFIGURED_REVIEW", candidateIds, conflict: true, conflictCandidateIds: candidateIds, reason: "NO_CONFIGURED_AUTHORITY_PRESENT" };
}
