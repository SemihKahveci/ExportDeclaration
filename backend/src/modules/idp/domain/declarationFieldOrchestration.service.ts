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

const DIRECT_SOURCE_CURRENCIES = new Set(["TRY", "EUR", "USD", "GBP", "CHF", "JPY", "CNY", "RUB", "AED", "SAR"]);

function canonicalCurrency(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const currency = value.trim().toUpperCase() === "TL" ? "TRY" : value.trim().toUpperCase();
  return DIRECT_SOURCE_CURRENCIES.has(currency) ? currency : undefined;
}

function canonicalPositiveNumber(value: unknown): string | undefined {
  const number = finiteNumber(value);
  return number !== undefined && number > 0 ? String(number) : undefined;
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

  /*
   * Commercial monetary fields have a deliberately role-bound native-text
   * candidate produced by invoiceCommercialTermsCandidateDiscovery.  Do not
   * let an older generic native candidate make that evidence "ambiguous": the
   * role-bound candidate exists precisely because its value was read from an
   * explicit invoice-total / exchange-rate label.  The candidate still flows
   * through Foundation 6; this is an authority selection, not a normalizedData
   * write.
   */
  const roleBoundCommercialCandidateIds: Record<string, string> = {
    totalAmount: "header-total-amount:f6-totalAmount",
    exchangeRate: "finance-exchange-rate:f6-exchangeRate",
    currency: "header-currency-from-total:f6-currency",
    transportMode: "transport-mode:f6-transportMode",
    paymentType: "trade-payment-type:f6-paymentType",
    freight: "finance-freight:f6-freight",
    insurance: "finance-insurance:f6-insurance",
    bankInfo: "finance-bank-info:f6-bankInfo"
  };
  const roleBoundFields = new Set<string>();
  for (const [field, candidateId] of Object.entries(roleBoundCommercialCandidateIds)) {
    const candidate = (candidates.fields[field] ?? []).find((item) =>
      item.candidateId === candidateId &&
      !item.derived &&
      item.evidence.some((evidence) => evidence.contentSource === "NATIVE_TEXT")
    );
    if (!candidate) continue;
    const valid = field === "currency"
      ? canonicalCurrency(candidate.value) !== undefined
      : field === "transportMode" || field === "paymentType"
        ? typeof candidate.value === "string" && candidate.value.trim().length >= 3 && candidate.value.trim().length <= 120
        : field === "bankInfo"
          ? typeof candidate.value === "string" && candidate.value.trim().length >= 4 && candidate.value.trim().length <= 2000 && /(?:BANK|BANKA|IBAN|SWIFT|BIC|ACCOUNT|HESAP)/i.test(candidate.value)
        : field === "freight" || field === "insurance"
          ? finiteNumber(candidate.value) !== undefined && finiteNumber(candidate.value)! >= 0
          : canonicalPositiveNumber(candidate.value) !== undefined;
    if (!valid) continue;
    selections.push({ field, candidateId: candidate.candidateId, source: "DIRECT_SOURCE_EVIDENCE" });
    roleBoundFields.add(field);
  }

  /*
   * 1.8.24: deterministic header/party discovery is itself role-bound by the
   * canonical invoice geometry (invoice labels and the SAYIN party boundary).
   * When such a candidate is backed by NATIVE_TEXT, allow it to select authority
   * over conflicting page-image interpretations.  We deliberately key this to
   * the production candidate ids emitted by canonicalHeaderPartyCandidatesOf;
   * arbitrary native text or a model value cannot opt into this authority path.
   */
  const roleBoundHeaderCandidateIds: Record<string, string> = {
    invoiceNo: "header-invoice-no:f6-header-party",
    invoiceDate: "header-invoice-date:f6-header-party",
    "parties.seller.name": "party-seller-name:f6-header-party",
    "parties.seller.address": "party-seller-address:f6-header-party",
    "parties.seller.country": "party-seller-country:f6-header-party",
    "parties.buyer.name": "party-buyer-name:f6-header-party",
    "parties.buyer.address": "party-buyer-address:f6-header-party",
    "parties.buyer.country": "party-buyer-country:f6-header-party"
  };
  const headerValueValid = (field: string, value: unknown): boolean => {
    if (typeof value !== "string") return false;
    const compact = value.trim().replace(/\s+/g, " ");
    if (!compact) return false;
    if (field === "invoiceNo") return exactTurkishInvoiceNumber(compact) !== undefined;
    if (field === "invoiceDate") return /^20\d{2}-\d{2}-\d{2}$/.test(compact);
    if (field.endsWith(".country")) return compact.length >= 2 && compact.length <= 40 && /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(compact);
    if (field.endsWith(".name")) return compact.length >= 3 && compact.length <= 160 && /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(compact);
    if (field.endsWith(".address")) return compact.length >= 6 && compact.length <= 500;
    return false;
  };
  for (const [field, candidateId] of Object.entries(roleBoundHeaderCandidateIds)) {
    const candidate = (candidates.fields[field] ?? []).find((item) =>
      item.candidateId === candidateId &&
      !item.derived &&
      headerValueValid(field, item.value) &&
      item.evidence.some((evidence) => evidence.contentSource === "NATIVE_TEXT")
    );
    if (!candidate) continue;
    selections.push({ field, candidateId: candidate.candidateId, source: "DIRECT_SOURCE_EVIDENCE" });
    roleBoundFields.add(field);
  }

  // 1.8.28: shipment totals/weights/package type discovered from explicit
  // canonical labels are direct source evidence. Keep this path model-neutral:
  // Vision may corroborate it, but cannot outrank the role-bound native value.
  for (const field of ["totalPackage", "packageType", "grossWeight", "netWeight"]) {
    const eligible = (candidates.fields[field] ?? []).filter((item) =>
      String(item.candidateId).endsWith(":f6-native-shipment") &&
      !item.derived &&
      item.evidence.some((evidence) => evidence.contentSource === "NATIVE_TEXT")
    );
    if (eligible.length !== 1) continue;
    const candidate = eligible[0]!;
    const valid = field === "packageType"
      ? typeof candidate.value === "string" && candidate.value.trim().length >= 2 && candidate.value.trim().length <= 80
      : canonicalPositiveNumber(candidate.value) !== undefined;
    if (!valid) continue;
    selections.push({ field, candidateId: candidate.candidateId, source: "DIRECT_SOURCE_EVIDENCE" });
    roleBoundFields.add(field);
  }

  for (const [field, fieldCandidates] of Object.entries(candidates.fields)) {
    if (roleBoundFields.has(field)) continue;
    const canonicalValue = /^goodsLines\.\d+\.hsCode$/.test(field)
      ? exactTwelveDigitGtip
      : field === "deliveryTerm"
        ? canonicalIncoterm
        : field === "invoiceNo"
          ? exactTurkishInvoiceNumber
          : field === "currency"
            ? canonicalCurrency
            : field === "totalAmount" || field === "exchangeRate"
              ? canonicalPositiveNumber
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

  // 8.18: PAGE_IMAGE is the semantic-primary source for goods identity. A
  // geometrically validated native row can still bind the wrong token to a
  // semantic column (for example model/material code vs short description).
  // Preserve a high-confidence Vision identity candidate instead of blindly
  // replacing it merely because a native token exists. This is row-generic and
  // requires no supplier/layout constants.
  const semanticVisionAuthorityFields = new Set<string>();
  for (const [field, fieldCandidates] of Object.entries(candidates.fields)) {
    if (!/^goodsLines\.\d+\.(productCode|description)$/.test(field)) continue;
    const vision = fieldCandidates.filter((candidate) =>
      candidate.extractor === "invoice-qwen-vision-v1" &&
      candidate.confidence >= 0.95 &&
      typeof candidate.value === "string" && candidate.value.trim().length > 0 &&
      candidate.evidence.some((evidence) => evidence.contentSource === "PAGE_IMAGE")
    );
    if (vision.length !== 1) continue;
    selections.push({ field, candidateId: vision[0]!.candidateId, source: "DIRECT_SOURCE_EVIDENCE" });
    semanticVisionAuthorityFields.add(field);
  }

  // For a single commercial row, Vision numeric semantics may outrank a
  // conflicting native row only when the complete Vision tuple is arithmetic-
  // consistent AND its line total is independently corroborated by the document
  // total. This fixes semantic column swaps without making arithmetic invent a
  // value. Multi-row documents remain on the stricter native/reconciled path.
  const goodsRowIndexes = new Set(Object.keys(candidates.fields).flatMap((field) => {
    const match = /^goodsLines\.(\d+)\./.exec(field);
    return match ? [Number(match[1])] : [];
  }));
  if (goodsRowIndexes.size === 1 && goodsRowIndexes.has(0)) {
    const visionCandidate = (suffix: string) => (candidates.fields[`goodsLines.0.${suffix}`] ?? []).find((candidate) =>
      candidate.extractor === "invoice-qwen-vision-v1" &&
      candidate.confidence >= 0.95 &&
      candidate.evidence.some((evidence) => evidence.contentSource === "PAGE_IMAGE")
    );
    const quantity = visionCandidate("quantity");
    const unit = visionCandidate("unit");
    const unitPrice = visionCandidate("unitPrice");
    const lineTotal = visionCandidate("lineTotal");
    const q = finiteNumber(quantity?.value);
    const p = finiteNumber(unitPrice?.value);
    const a = finiteNumber(lineTotal?.value);
    const documentTotals = (candidates.fields.totalAmount ?? [])
      .map((candidate) => finiteNumber(candidate.value))
      .filter((value): value is number => value !== undefined && value > 0);
    const totalCorroborated = a !== undefined && documentTotals.some((total) => approximatelyEqual(total, a));
    if (q !== undefined && q > 0 && p !== undefined && p >= 0 && a !== undefined && a >= 0 &&
        approximatelyEqual(q * p, a) && totalCorroborated) {
      for (const [suffix, candidate] of [["quantity", quantity], ["unit", unit], ["unitPrice", unitPrice], ["lineTotal", lineTotal]] as const) {
        if (!candidate) continue;
        const field = `goodsLines.0.${suffix}`;
        selections.push({ field, candidateId: candidate.candidateId, source: "DIRECT_SOURCE_EVIDENCE" });
        semanticVisionAuthorityFields.add(field);
      }
    }
  }

  // 1.8.21: a generic goods row that passed the canonical evidence validator
  // may provide direct native authority for its remaining row-local fields,
  // unless the stricter 8.18 semantic-primary arbitration above established
  // Vision authority for that exact field.
  for (const [field, fieldCandidates] of Object.entries(candidates.fields)) {
    if (!/^goodsLines\.\d+\.(productCode|description|quantity|unit|unitPrice|lineTotal)$/.test(field)) continue;
    if (semanticVisionAuthorityFields.has(field)) continue;
    const nativeRow = fieldCandidates.filter((candidate) =>
      candidate.candidateId.endsWith(":f6-native-row") &&
      !candidate.derived &&
      candidate.evidence.some((evidence) => evidence.contentSource === "NATIVE_TEXT")
    );
    if (nativeRow.length !== 1) continue;
    selections.push({ field, candidateId: nativeRow[0]!.candidateId, source: "DIRECT_SOURCE_EVIDENCE" });
  }

  // 1.8.34: validated native row-origin evidence may resolve only the
  // matching goodsLines.N.origin field.  It must never authorize the
  // declaration-wide originCountry/customs role.
  for (const [field, fieldCandidates] of Object.entries(candidates.fields)) {
    if (!/^goodsLines\.\d+\.origin$/.test(field)) continue;
    const nativeOrigin = fieldCandidates.filter((candidate) =>
      candidate.candidateId.endsWith(":f6-native-origin") &&
      !candidate.derived &&
      candidate.evidence.some((evidence) => evidence.contentSource === "NATIVE_TEXT")
    );
    if (nativeOrigin.length !== 1) continue;
    selections.push({ field, candidateId: nativeOrigin[0]!.candidateId, source: "DIRECT_SOURCE_EVIDENCE" });
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
