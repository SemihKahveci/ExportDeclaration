import type { DeclarationFieldCandidateEnvelope } from "./declarationFieldCandidate.types.js";
import type {
  DeclarationConsistencyComparator,
  DeclarationCrossDocumentConsistencyProfile,
  DeclarationCrossDocumentConsistencyResult,
  DeclarationFieldConsistencyResult
} from "./declarationCrossDocumentConsistency.types.js";

function invalidProfile(profile: DeclarationCrossDocumentConsistencyProfile): boolean {
  const fields = new Set<string>();
  for (const rule of profile.rules) {
    if (!rule.field.trim() || fields.has(rule.field)) return true;
    fields.add(rule.field);
    if (rule.documentTypes.length < 2 || new Set(rule.documentTypes).size !== rule.documentTypes.length) return true;
    if (rule.comparator.kind === "NUMERIC_TOLERANCE" &&
        (!Number.isFinite(rule.comparator.absoluteTolerance) || rule.comparator.absoluteTolerance < 0)) return true;
  }
  return false;
}

function comparable(value: unknown, comparator: DeclarationConsistencyComparator): string | number | undefined {
  if (comparator.kind === "NUMERIC_TOLERANCE") {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
    return undefined;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    return comparator.kind === "CASE_INSENSITIVE_TEXT" ? normalized.toLocaleUpperCase("en-US") : normalized;
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  return JSON.stringify(value);
}

function valuesMatch(values: unknown[], comparator: DeclarationConsistencyComparator): boolean {
  const normalized = values.map((value) => comparable(value, comparator));
  if (normalized.some((value) => value === undefined)) return false;
  if (comparator.kind === "NUMERIC_TOLERANCE") {
    const numbers = normalized as number[];
    return Math.max(...numbers) - Math.min(...numbers) <= comparator.absoluteTolerance;
  }
  return normalized.every((value) => value === normalized[0]);
}

/**
 * Evaluates only caller-configured cross-document consistency rules. It does not
 * invent which declaration fields must agree or which document role is authoritative.
 */
export function assessDeclarationCrossDocumentConsistency(
  candidates: DeclarationFieldCandidateEnvelope,
  profile: DeclarationCrossDocumentConsistencyProfile
): DeclarationCrossDocumentConsistencyResult {
  if (invalidProfile(profile)) {
    return { status: "INVALID_PROFILE", fields: [], conflictFields: [], insufficientEvidenceFields: [] };
  }

  const fields: DeclarationFieldConsistencyResult[] = profile.rules.map((rule) => {
    const allowed = new Set(rule.documentTypes);
    const observations = (candidates.fields[rule.field] ?? [])
      .filter((candidate) => allowed.has(candidate.documentType))
      .map((candidate) => ({
        candidateId: candidate.candidateId,
        documentType: candidate.documentType,
        logicalDocumentId: candidate.logicalDocumentId,
        uploadedFileId: candidate.uploadedFileId,
        value: candidate.value
      }))
      .sort((a, b) => a.documentType.localeCompare(b.documentType) || a.candidateId.localeCompare(b.candidateId));

    const presentTypes = new Set(observations.map((observation) => observation.documentType));
    const missingDocumentTypes = rule.documentTypes.filter((type) => !presentTypes.has(type));
    if (rule.requireAllDocumentTypes && missingDocumentTypes.length > 0) {
      return { field: rule.field, status: "INSUFFICIENT_EVIDENCE", documentTypes: rule.documentTypes, missingDocumentTypes, observations, reason: "MISSING_CONFIGURED_DOCUMENT_TYPE" };
    }
    if (presentTypes.size < 2) {
      return { field: rule.field, status: "INSUFFICIENT_EVIDENCE", documentTypes: rule.documentTypes, missingDocumentTypes, observations, reason: "FEWER_THAN_TWO_DOCUMENT_TYPES" };
    }
    if (!valuesMatch(observations.map((observation) => observation.value), rule.comparator)) {
      return { field: rule.field, status: "CONFLICT", documentTypes: rule.documentTypes, missingDocumentTypes, observations, reason: "VALUE_MISMATCH" };
    }
    return { field: rule.field, status: "CONSISTENT", documentTypes: rule.documentTypes, missingDocumentTypes, observations };
  });

  const conflictFields = fields.filter((field) => field.status === "CONFLICT").map((field) => field.field);
  const insufficientEvidenceFields = fields.filter((field) => field.status === "INSUFFICIENT_EVIDENCE").map((field) => field.field);
  return {
    status: conflictFields.length === 0 && insufficientEvidenceFields.length === 0 ? "CONSISTENT" : "REVIEW_REQUIRED",
    fields,
    conflictFields,
    insufficientEvidenceFields
  };
}
