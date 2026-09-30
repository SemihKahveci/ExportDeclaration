import { createHash } from "node:crypto";
import mongoose from "mongoose";
import type { CrossDocumentFieldRule } from "./crossDocumentFieldResolution.types.js";
import type { DeclarationCandidateAuthoritySelection } from "./declarationFieldResolution.types.js";
import type { SourceFieldCandidates } from "./declarationFieldCandidateProjector.js";
import { projectDeclarationFieldCandidates } from "./declarationFieldCandidateProjector.js";
import { loadDeclarationDocumentSet } from "./declarationDocumentSet.service.js";
import { resolveAndPersistDeclarationFields } from "./declarationFieldResolution.service.js";
import { promotePersistedDeclarationFieldResolution } from "./declarationFieldPromotion.service.js";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}

function orchestrationKey(params: {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
  documents: unknown;
  sources: SourceFieldCandidates[];
  rules: CrossDocumentFieldRule[];
}): string {
  const payload = JSON.stringify(canonicalize({
    companyId: String(params.companyId),
    declarationId: String(params.declarationId),
    documents: params.documents,
    sources: params.sources,
    rules: params.rules
  }));
  return createHash("sha256").update(payload).digest("hex");
}


const INCOTERMS_2020 = new Set([
  "EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP", "FAS", "FOB", "CFR", "CIF"
]);

function canonicalIncoterm(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const term = value.trim().toUpperCase();
  return INCOTERMS_2020.has(term) ? term : undefined;
}

function exactTwelveDigitGtip(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const digits = String(value).replace(/\D/g, "");
  return /^\d{12}$/.test(digits) ? digits : undefined;
}

/**
 * A machine-readable native-text GTIP is stronger evidence than a conflicting
 * image interpretation only when the direct source is unambiguous. We keep all
 * peer candidates in the audit envelope; this merely supplies an explicit,
 * deterministic authority selection to Foundation 6.
 */
function exactTurkishInvoiceNumber(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const compact = value.trim().replace(/\s+/g, "");
  return /^[A-Za-z0-9]{3}20\d{2}\d{9}$/.test(compact) ? compact.toUpperCase() : undefined;
}

function evidenceTextMatchesValue(candidate: { value: unknown; evidence: Array<{ contentSource: string; text?: string }> }): boolean {
  if (typeof candidate.value !== "string") return false;
  const expected = candidate.value.trim().replace(/\s+/g, "").toUpperCase();
  return candidate.evidence.some((evidence) =>
    evidence.contentSource === "NATIVE_TEXT" &&
    typeof evidence.text === "string" &&
    evidence.text.trim().replace(/\s+/g, "").toUpperCase() === expected
  );
}

function finiteNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function approximatelyEqual(a: number, b: number): boolean {
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= scale * 1e-6;
}


function normalizedEvidenceText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : undefined;
}

function goodsRowCandidatePrefix(field: string, candidateId: string): string | undefined {
  const fieldMatch = /^goodsLines\.(\d+)\./.exec(field);
  if (!fieldMatch) return undefined;
  const rowIndex = Number(fieldMatch[1]);
  if (!Number.isInteger(rowIndex)) return undefined;
  const lineNo = rowIndex + 1;
  const suffix = `:line-${lineNo}:`;
  const suffixIndex = candidateId.lastIndexOf(suffix);
  return suffixIndex >= 0 ? candidateId.slice(0, suffixIndex + suffix.length) : undefined;
}

/**
 * A native description can outrank a conflicting page-image interpretation only
 * when it is direct source text and its production candidate is tied to the same
 * deterministic goods row as multiple independent row anchors. Column order is
 * deliberately irrelevant: row identity/evidence, not "description before qty",
 * is the authority condition.
 */
function selectRowCorroboratedDescriptions(
  candidates: ReturnType<typeof projectDeclarationFieldCandidates>
): DeclarationCandidateAuthoritySelection[] {
  const selections: DeclarationCandidateAuthoritySelection[] = [];
  const anchorFields = ["hsCode", "productCode", "quantity", "unitPrice", "lineTotal"];

  for (const [field, descriptions] of Object.entries(candidates.fields)) {
    const match = /^goodsLines\.(\d+)\.description$/.exec(field);
    if (!match) continue;
    const row = match[1]!;

    const corroborated = descriptions.filter((description) => {
      if (description.derived) return false;
      const descriptionText = normalizedEvidenceText(description.value);
      if (!descriptionText) return false;
      const directText = description.evidence.some((evidence) =>
        evidence.contentSource === "NATIVE_TEXT" &&
        normalizedEvidenceText(evidence.text) === descriptionText
      );
      if (!directText) return false;

      const prefix = goodsRowCandidatePrefix(field, description.candidateId);
      if (!prefix) return false;
      let nativeAnchorCount = 0;
      for (const anchor of anchorFields) {
        const siblings = candidates.fields[`goodsLines.${row}.${anchor}`] ?? [];
        if (siblings.some((candidate) =>
          !candidate.derived &&
          candidate.candidateId.startsWith(prefix) &&
          candidate.evidence.some((evidence) => evidence.contentSource === "NATIVE_TEXT")
        )) nativeAnchorCount += 1;
      }
      return nativeAnchorCount >= 2;
    });

    if (corroborated.length === 0) continue;
    const values = new Set(corroborated.map((candidate) => normalizedEvidenceText(candidate.value)!.toLocaleUpperCase("tr-TR")));
    if (values.size !== 1) continue;
    const selected = corroborated.slice().sort((a, b) => b.confidence - a.confidence || a.candidateId.localeCompare(b.candidateId))[0]!;
    selections.push({ field, candidateId: selected.candidateId, source: "DIRECT_SOURCE_EVIDENCE" });
  }
  return selections;
}

/**
 * Select a native unit-price candidate only when the same commercial row
 * independently corroborates it through quantity × unitPrice = lineTotal.
 * Conflicting peer candidates remain in the audit envelope. Ambiguous or
 * incomplete arithmetic deliberately produces no authority selection.
 */
function selectArithmeticCorroboratedUnitPrices(
  candidates: ReturnType<typeof projectDeclarationFieldCandidates>
): DeclarationCandidateAuthoritySelection[] {
  const selections: DeclarationCandidateAuthoritySelection[] = [];
  for (const [field, prices] of Object.entries(candidates.fields)) {
    const match = /^goodsLines\.(\d+)\.unitPrice$/.exec(field);
    if (!match) continue;
    const row = match[1]!;
    const quantities = candidates.fields[`goodsLines.${row}.quantity`] ?? [];
    const totals = candidates.fields[`goodsLines.${row}.lineTotal`] ?? [];
    if (quantities.length === 0 || totals.length === 0) continue;

    const nativePrices = prices.filter((candidate) =>
      !candidate.derived &&
      finiteNumber(candidate.value) !== undefined &&
      candidate.evidence.some((evidence) => evidence.contentSource === "NATIVE_TEXT")
    );
    const corroborated = nativePrices.filter((priceCandidate) => {
      const price = finiteNumber(priceCandidate.value)!;
      return quantities.some((quantityCandidate) => {
        const quantity = finiteNumber(quantityCandidate.value);
        if (quantity === undefined) return false;
        return totals.some((totalCandidate) => {
          const total = finiteNumber(totalCandidate.value);
          return total !== undefined && approximatelyEqual(quantity * price, total);
        });
      });
    });
    if (corroborated.length === 0) continue;
    const values = new Set(corroborated.map((candidate) => String(finiteNumber(candidate.value))));
    if (values.size !== 1) continue;
    const selected = corroborated.slice().sort((a, b) => b.confidence - a.confidence || a.candidateId.localeCompare(b.candidateId))[0]!;
    selections.push({ field, candidateId: selected.candidateId, source: "DIRECT_SOURCE_EVIDENCE" });
  }
  return selections;
}

/**
 * Direct-source authority is intentionally narrow. Structured identifiers and
 * commercial terms must be self-validating in native text; numeric unit prices
 * additionally require same-row arithmetic corroboration. This keeps Foundation
 * 6 fail-closed while preventing a conflicting image interpretation from
 * outranking machine-readable source evidence that the document itself proves.
 */
export function selectDirectSourceEvidenceAuthority(
  candidates: ReturnType<typeof projectDeclarationFieldCandidates>
): DeclarationCandidateAuthoritySelection[] {
  const selections: DeclarationCandidateAuthoritySelection[] = [];
  for (const [field, fieldCandidates] of Object.entries(candidates.fields)) {
    const canonicalValue = /^goodsLines\.\d+\.hsCode$/.test(field)
      ? exactTwelveDigitGtip
      : field === "deliveryTerm"
        ? canonicalIncoterm
        : field === "invoiceNo"
          ? exactTurkishInvoiceNumber
          : undefined;
    if (!canonicalValue) continue;

    const native = fieldCandidates.filter((candidate) =>
      !candidate.derived &&
      canonicalValue(candidate.value) !== undefined &&
      candidate.evidence.some((evidence) => evidence.contentSource === "NATIVE_TEXT") &&
      (field !== "invoiceNo" || evidenceTextMatchesValue(candidate))
    );
    if (native.length === 0) continue;
    const values = new Set(native.map((candidate) => canonicalValue(candidate.value)));
    if (values.size !== 1) continue;
    const selected = native.slice().sort((a, b) => b.confidence - a.confidence || a.candidateId.localeCompare(b.candidateId))[0]!;
    selections.push({ field, candidateId: selected.candidateId, source: "DIRECT_SOURCE_EVIDENCE" });
  }

  selections.push(...selectArithmeticCorroboratedUnitPrices(candidates));
  selections.push(...selectRowCorroboratedDescriptions(candidates));
  const unique = new Map(selections.map((selection) => [selection.field, selection]));
  return [...unique.values()].sort((a, b) => a.field.localeCompare(b.field));
}

/**
 * Production boundary for Foundation 6 declaration-wide resolution.
 * A single call loads the persisted logical-document set, validates it, projects
 * file candidates onto logical documents, persists the resolution audit run and
 * promotes only RESOLVED fields. The deterministic orchestration key makes an
 * exact retry idempotent without allowing an old retry to replace a newer run.
 */
export async function orchestrateDeclarationFieldResolution(params: {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
  sources: SourceFieldCandidates[];
  rules?: CrossDocumentFieldRule[];
}) {
  const loaded = await loadDeclarationDocumentSet({
    companyId: params.companyId,
    declarationId: params.declarationId
  });
  if (!loaded.integrity.valid) {
    const codes = [...new Set(loaded.integrity.issues.map((issue) => issue.code))].sort().join(",");
    throw new Error(`Declaration document set integrity failed: ${codes}`);
  }

  const candidates = projectDeclarationFieldCandidates({
    documentSet: loaded.documentSet,
    sources: params.sources
  });
  const rules = params.rules ?? [];
  const candidateSelections = selectDirectSourceEvidenceAuthority(candidates);
  const key = orchestrationKey({
    companyId: params.companyId,
    declarationId: params.declarationId,
    documents: loaded.documentSet.documents,
    sources: params.sources,
    rules
  });

  const persisted = await resolveAndPersistDeclarationFields({
    companyId: params.companyId,
    declarationId: params.declarationId,
    candidates,
    rules,
    candidateSelections,
    orchestrationKey: key
  });

  const promotion = await promotePersistedDeclarationFieldResolution({
    companyId: params.companyId,
    declarationId: params.declarationId,
    resolutionRunId: persisted.run._id
  });

  return {
    orchestrationKey: key,
    reusedResolutionRun: persisted.reused,
    documentSet: loaded.documentSet,
    candidates,
    resolutionRunId: String(persisted.run._id),
    resolution: persisted.resolution,
    promotion
  };
}
