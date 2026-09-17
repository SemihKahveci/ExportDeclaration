import {
  FieldResolutionMethod,
  FieldResolutionStatus,
  type FieldCandidate,
  type FieldCandidateEnvelope,
  type FieldResolutionEnvelope
} from "../domain/fieldCandidate.types.js";

function normalizedValueKey(value: unknown): string {
  if (typeof value === "string") return `s:${value.trim().replace(/\s+/g, " ")}`;
  if (typeof value === "number") return `n:${Object.is(value, -0) ? 0 : value}`;
  if (typeof value === "boolean") return `b:${value}`;
  if (value === null) return "null";
  return `j:${JSON.stringify(value)}`;
}

function uniqueCandidates(candidates: FieldCandidate[]): Map<string, FieldCandidate[]> {
  const groups = new Map<string, FieldCandidate[]>();
  for (const candidate of candidates) {
    const key = normalizedValueKey(candidate.value);
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }
  return groups;
}

function bestCandidate(candidates: FieldCandidate[]): FieldCandidate {
  return [...candidates].sort((a, b) =>
    b.confidence - a.confidence || a.candidateId.localeCompare(b.candidateId)
  )[0]!;
}

export function resolveFieldCandidates(
  envelope: FieldCandidateEnvelope
): FieldResolutionEnvelope {
  const fields: FieldResolutionEnvelope["fields"] = {};
  let resolvedCount = 0;
  let ambiguousCount = 0;

  for (const [field, candidates] of Object.entries(envelope.fields)) {
    if (candidates.length === 0) continue;
    const groups = uniqueCandidates(candidates);

    if (groups.size === 1) {
      const group = [...groups.values()][0]!;
      const selected = bestCandidate(group);
      fields[field] = {
        field,
        status: FieldResolutionStatus.RESOLVED,
        method: group.length === 1
          ? FieldResolutionMethod.SINGLE_VALUE
          : FieldResolutionMethod.CONSENSUS,
        candidateIds: group.map((candidate) => candidate.candidateId),
        selectedCandidateId: selected.candidateId,
        value: selected.value
      };
      resolvedCount += 1;
      continue;
    }

    fields[field] = {
      field,
      status: FieldResolutionStatus.AMBIGUOUS,
      method: FieldResolutionMethod.AMBIGUOUS,
      candidateIds: candidates.map((candidate) => candidate.candidateId)
    };
    ambiguousCount += 1;
  }

  return {
    version: "1",
    status: ambiguousCount > 0 ? FieldResolutionStatus.AMBIGUOUS : FieldResolutionStatus.RESOLVED,
    fields,
    summary: {
      fieldCount: Object.keys(fields).length,
      resolvedCount,
      ambiguousCount
    }
  };
}

export function getFieldCandidateEnvelope(data: Record<string, unknown>): FieldCandidateEnvelope | undefined {
  const raw = data.fieldCandidates;
  if (!raw || typeof raw !== "object") return undefined;
  const candidate = raw as Partial<FieldCandidateEnvelope>;
  if (candidate.version !== "1" || !candidate.fields || typeof candidate.fields !== "object") return undefined;
  return candidate as FieldCandidateEnvelope;
}
