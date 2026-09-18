import type { FieldCandidate, FieldCandidateEnvelope } from "../domain/fieldCandidate.types.js";
import { GenericEvidenceValidationStatus } from "../domain/genericEvidenceValidation.types.js";
import type { GenericEvidenceValidationResult } from "../domain/genericEvidenceValidation.types.js";
import {
  GenericMigrationFieldStatus,
  type GenericInvoiceMigrationAudit,
  type GenericMigrationFieldComparison
} from "../domain/genericCandidateMigration.types.js";

function normalizedString(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleUpperCase("tr-TR");
}

function exactValueKey(value: unknown): string {
  if (typeof value === "string") return `s:${normalizedString(value)}`;
  if (typeof value === "number") return `n:${Object.is(value, -0) ? 0 : value}`;
  if (typeof value === "boolean") return `b:${value}`;
  if (value === null) return "null";
  return `j:${JSON.stringify(value)}`;
}

function values(candidates: FieldCandidate[]): unknown[] {
  const seen = new Set<string>();
  const result: unknown[] = [];
  for (const candidate of candidates) {
    const key = exactValueKey(candidate.value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate.value);
  }
  return result;
}

function isProductCodeField(field: string): boolean {
  return /\.productCode$/.test(field);
}

function isDescriptionField(field: string): boolean {
  return /\.description$/.test(field);
}

function normalizedProductCode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = normalizedString(value).replace(/[^A-Z0-9]/g, "");
  return normalized || undefined;
}

function productCodeEquivalent(a: unknown, b: unknown): boolean {
  const left = normalizedProductCode(a);
  const right = normalizedProductCode(b);
  if (!left || !right) return false;
  if (left === right) return true;

  // Namespace decomposition is only considered equivalent when the shorter
  // code remains a meaningful terminal identifier. This covers values such as
  // AG.EAT.216384 -> EAT.216384 -> 216384 without treating arbitrary tiny
  // numeric fragments as product codes.
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  return shorter.length >= 5 && longer.endsWith(shorter);
}

function descriptionTokens(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return normalizedString(value)
    .split(/\s+/)
    .map(token => token.replace(/^[^A-Z0-9ÇĞİÖŞÜ]+|[^A-Z0-9ÇĞİÖŞÜ./,_-]+$/g, ""))
    .filter(Boolean);
}

function productCodeValuesForRow(envelope: FieldCandidateEnvelope, field: string): unknown[] {
  const prefix = field.replace(/\.description$/, ".productCode");
  return values(envelope.fields[prefix] ?? []);
}

function tokenIsProductCodeAlias(token: string, codes: unknown[]): boolean {
  return codes.some(code => productCodeEquivalent(token, code));
}

function normalizedDescriptionWithoutProductCodes(value: unknown, codes: unknown[]): string | undefined {
  if (typeof value !== "string") return undefined;
  const tokens = descriptionTokens(value).filter(token => !tokenIsProductCodeAlias(token, codes));
  return tokens.join(" ");
}

function descriptionsEquivalent(
  legacyValues: unknown[],
  genericValues: unknown[],
  legacyCodes: unknown[],
  genericCodes: unknown[]
): boolean {
  const allCodes = [...legacyCodes, ...genericCodes];
  return legacyValues.some(left => {
    const l = normalizedDescriptionWithoutProductCodes(left, allCodes);
    if (!l) return false;
    return genericValues.some(right => {
      const r = normalizedDescriptionWithoutProductCodes(right, allCodes);
      return Boolean(r) && l === r;
    });
  });
}

function anyExactMatch(legacy: unknown[], generic: unknown[]): boolean {
  const genericKeys = new Set(generic.map(exactValueKey));
  return legacy.some((value) => genericKeys.has(exactValueKey(value)));
}

function anyEquivalentProductCode(legacy: unknown[], generic: unknown[]): boolean {
  return legacy.some((left) => generic.some((right) => productCodeEquivalent(left, right)));
}

function compareField(
  field: string,
  legacyCandidates: FieldCandidate[],
  genericCandidates: FieldCandidate[],
  legacyEnvelope: FieldCandidateEnvelope,
  genericEnvelope: FieldCandidateEnvelope
): GenericMigrationFieldComparison {
  const legacyValues = values(legacyCandidates);
  const genericValues = values(genericCandidates);

  let status: GenericMigrationFieldComparison["status"];
  if (legacyCandidates.length === 0) status = GenericMigrationFieldStatus.GENERIC_ONLY;
  else if (genericCandidates.length === 0) status = GenericMigrationFieldStatus.LEGACY_ONLY;
  else if (anyExactMatch(legacyValues, genericValues)) status = GenericMigrationFieldStatus.AGREE;
  else if (isProductCodeField(field) && anyEquivalentProductCode(legacyValues, genericValues)) {
    status = GenericMigrationFieldStatus.EQUIVALENT;
  } else if (isDescriptionField(field) && descriptionsEquivalent(
    legacyValues,
    genericValues,
    productCodeValuesForRow(legacyEnvelope, field),
    productCodeValuesForRow(genericEnvelope, field)
  )) {
    status = GenericMigrationFieldStatus.EQUIVALENT;
  } else status = GenericMigrationFieldStatus.CONFLICT;

  return {
    field,
    status,
    legacyCandidateIds: legacyCandidates.map((candidate) => candidate.candidateId),
    genericCandidateIds: genericCandidates.map((candidate) => candidate.candidateId),
    legacyValues,
    genericValues
  };
}

export function compareGenericAndLegacyInvoiceCandidates(
  legacy: FieldCandidateEnvelope,
  generic: FieldCandidateEnvelope,
  validation: GenericEvidenceValidationResult
): GenericInvoiceMigrationAudit {
  const fieldNames = [...new Set([
    ...Object.keys(legacy.fields),
    ...Object.keys(generic.fields)
  ])].sort();

  const fields: Record<string, GenericMigrationFieldComparison> = {};
  const summary = {
    fieldCount: fieldNames.length,
    agreeCount: 0,
    equivalentCount: 0,
    genericOnlyCount: 0,
    legacyOnlyCount: 0,
    conflictCount: 0
  };

  for (const field of fieldNames) {
    const comparison = compareField(field, legacy.fields[field] ?? [], generic.fields[field] ?? [], legacy, generic);
    fields[field] = comparison;
    switch (comparison.status) {
      case GenericMigrationFieldStatus.AGREE: summary.agreeCount += 1; break;
      case GenericMigrationFieldStatus.EQUIVALENT: summary.equivalentCount += 1; break;
      case GenericMigrationFieldStatus.GENERIC_ONLY: summary.genericOnlyCount += 1; break;
      case GenericMigrationFieldStatus.LEGACY_ONLY: summary.legacyOnlyCount += 1; break;
      case GenericMigrationFieldStatus.CONFLICT: summary.conflictCount += 1; break;
    }
  }

  const promotionReasons: string[] = [];
  if (validation.status !== GenericEvidenceValidationStatus.VALID) {
    promotionReasons.push("GENERIC_EVIDENCE_REVIEW_REQUIRED");
  }
  if (validation.summary.rowCount === 0) {
    promotionReasons.push("NO_GENERIC_GOODS_ROWS");
  }

  const promotable = promotionReasons.length === 0;
  return {
    version: "2",
    policy: "CANONICAL_EVIDENCE_GATE_WITH_LEGACY_AUDIT",
    promotable,
    promotion: {
      authority: "GENERIC_CANONICAL_EVIDENCE",
      status: promotable ? "READY" : "REVIEW_REQUIRED",
      reasons: promotionReasons
    },
    fields,
    summary
  };
}
