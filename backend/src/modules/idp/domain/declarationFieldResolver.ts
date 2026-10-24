import { resolveCrossDocumentField } from "./crossDocumentFieldResolver.js";
import type { CrossDocumentFieldRule } from "./crossDocumentFieldResolution.types.js";
import type { DeclarationFieldCandidate } from "./declarationFieldCandidate.types.js";
import { classifyGoodsLineTotalScale } from "./goodsLineTotalScale.js";
import { appendIdpRuntimeDiag } from "../diagnostics/idpRuntimeDiagFile.js";
import type {
  DeclarationFieldResolutionEnvelope,
  ResolveDeclarationFieldsParams,
  ResolvedDeclarationField,
  DeclarationCandidateAuthoritySelection
} from "./declarationFieldResolution.types.js";

function resolvedGoodsNumber(field: ResolvedDeclarationField | undefined): number | undefined {
  if (!field || field.status !== "RESOLVED") return undefined;
  return typeof field.value === "number" && Number.isFinite(field.value) ? field.value : undefined;
}

/**
 * Last net for a goods triple that was split after vision: a correct commercial
 * quantity and unit price beside a clean scale-blown line total is repaired to
 * their product. A severe mismatch that is not a clean scale stays
 * REVIEW_REQUIRED so promotion does not write it and Belge İncelemesi lists it.
 */
function applyGoodsLineTotalScaleAuthority(
  fields: Record<string, ResolvedDeclarationField>,
  reviewRequiredFields: string[]
): void {
  const indexes = new Set<string>();
  for (const name of Object.keys(fields)) {
    const match = /^goodsLines\.(\d+)\.(?:quantity|unitPrice|lineTotal)$/.exec(name);
    if (match?.[1]) indexes.add(match[1]);
  }

  const repairSamples: Array<{ index: string; quantity: number; unitPrice: number; rejected: number; repaired: number }> = [];
  const reviewSamples: Array<{ index: string; quantity: number; unitPrice: number; rejected: number }> = [];
  let repaired = 0;
  let review = 0;

  for (const index of [...indexes].sort((left, right) => Number(left) - Number(right))) {
    const quantity = resolvedGoodsNumber(fields[`goodsLines.${index}.quantity`]);
    const unitPrice = resolvedGoodsNumber(fields[`goodsLines.${index}.unitPrice`]);
    const totalField = fields[`goodsLines.${index}.lineTotal`];
    const lineTotal = resolvedGoodsNumber(totalField);
    if (quantity == null || unitPrice == null || lineTotal == null || !totalField) continue;

    const decision = classifyGoodsLineTotalScale(quantity, unitPrice, lineTotal);
    if (decision.action === "repair") {
      repaired += 1;
      fields[`goodsLines.${index}.lineTotal`] = { ...totalField, value: decision.value };
      if (repairSamples.length < 8) {
        repairSamples.push({
          index,
          quantity,
          unitPrice,
          rejected: decision.rejected,
          repaired: decision.value
        });
      }
    } else if (decision.action === "review") {
      review += 1;
      const fieldName = `goodsLines.${index}.lineTotal`;
      fields[fieldName] = {
        ...totalField,
        status: "REVIEW_REQUIRED",
        method: "CONFLICT_REVIEW",
        value: undefined,
        reason: "LINE_TOTAL_SCALE_REVIEW",
        conflict: true,
        conflictCandidateIds: totalField.candidateIds
      };
      if (!reviewRequiredFields.includes(fieldName)) reviewRequiredFields.push(fieldName);
      if (reviewSamples.length < 8) {
        reviewSamples.push({ index, quantity, unitPrice, rejected: decision.rejected });
      }
    }
  }

  if (repaired === 0 && review === 0) return;
  const payload = {
    repaired,
    review,
    repairSamples,
    reviewSamples
  };
  console.info("idp.declaration.line_total_scale", payload);
  appendIdpRuntimeDiag("idp.declaration.line_total_scale", payload);
}

/**
 * A declaration origin is one country. When the goods lines already carry
 * more than one origin, that header value stays for the user.
 */
function applyMixedGoodsOriginAuthority(
  fields: Record<string, ResolvedDeclarationField>,
  reviewRequiredFields: string[]
): void {
  const origins = new Set<string>();
  for (const [name, field] of Object.entries(fields)) {
    if (!/^goodsLines\.\d+\.origin$/.test(name) || field.status !== "RESOLVED") continue;
    if (typeof field.value === "string" && field.value.trim()) origins.add(field.value.trim());
  }
  const header = fields.originCountry;
  if (origins.size < 2 || !header || header.status !== "RESOLVED") return;
  fields.originCountry = {
    ...header,
    status: "REVIEW_REQUIRED",
    method: "CONFLICT_REVIEW",
    value: undefined,
    reason: "MIXED_LINE_ORIGINS",
    conflict: true,
    conflictCandidateIds: header.candidateIds
  };
  if (!reviewRequiredFields.includes("originCountry")) reviewRequiredFields.push("originCountry");
}

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

    let resolution = explicitlySelectedCandidate
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

    // Export-declaration GTIP authority is deliberately fail-closed at 12 digits.
    // A shorter HS heading/subheading may be useful evidence, but it is not a
    // complete Turkish GTIP and must never become normalizedData merely because
    // multiple extractors agree on the same truncated/classification value.
    if (/^goodsLines\.\d+\.hsCode$/.test(field) && resolution.status === "RESOLVED") {
      const digits = String(resolution.value ?? "").replace(/\D/g, "");
      if (!/^\d{12}$/.test(digits)) {
        resolution = {
          field,
          status: "REVIEW_REQUIRED" as const,
          method: "CONFLICT_REVIEW" as const,
          candidateIds: candidates.map((candidate) => candidate.candidateId),
          conflict: new Set(candidates.map((candidate) => JSON.stringify(candidate.value))).size > 1,
          conflictCandidateIds: candidates.map((candidate) => candidate.candidateId),
          reason: "GTIP_REQUIRES_12_DIGITS"
        };
      }
    }

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

  applyGoodsLineTotalScaleAuthority(fields, reviewRequiredFields);
  applyMixedGoodsOriginAuthority(fields, reviewRequiredFields);

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
