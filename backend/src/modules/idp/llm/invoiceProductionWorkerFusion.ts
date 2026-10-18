import { env } from "../../../config/env.js";
import type { CanonicalDocument } from "../domain/canonicalDocument.types.js";
import { runFoundation8ShadowRuntime } from "../understanding/invoiceUnderstandingShadowRuntime.js";
import { executeFoundation8SpecialistModelShadow } from "../understanding/invoiceUnderstandingSpecialistModelExecution.js";
import { reconcileFoundation8SpecialistModelShadow } from "../understanding/invoiceUnderstandingSpecialistReconciliation.js";
import { bridgeReconciledFoundation8ToCandidates, overlayReconciledFoundation8Candidates } from "../understanding/invoiceUnderstandingSpecialistCandidateBridge.js";
import type { CandidateExtractionEnvelope } from "../domain/candidateExtraction.types.js";
import type { DocumentSegment } from "../domain/documentSegment.types.js";
import type { SegmentClassification } from "../domain/segmentClassification.types.js";
import { ClassifiedDocumentType } from "../domain/segmentClassification.types.js";
import type { FieldCandidateEnvelope } from "../domain/fieldCandidate.types.js";
import { QwenVisionInvoiceProvider, sanitizeVisionBankInfo, sanitizeVisionPaymentType } from "./qwenVisionInvoiceProvider.js";
import { createFoundation8SpecialistProvider } from "./qwenTextInvoiceProvider.js";
import type { InvoiceLlmExtractionArtifact, InvoiceLlmExtractionProvider } from "../domain/invoiceLlmExtraction.types.js";
import type { InvoiceVisionPageRenderer } from "./invoiceProductionVisionExecution.js";
import { renderInvoicePagesForVision } from "./renderInvoicePagesForVision.js";
import {
  mergeInvoiceCandidateSources,
  mergeInvoicePrimaryWithFallback,
  planInvoiceProductionExtraction
} from "./invoiceProductionExtractionOrchestrator.js";
import { executeInvoiceVisionByPage } from "./invoiceProductionVisionExecution.js";
import { prepareInvoiceVisionCheckpoint, type PersistedInvoiceVisionCheckpoint } from "./invoiceVisionCheckpoint.js";
import { associateExplicitGoodsUnitsFromQuantity } from "./invoiceGoodsUnitAssociation.js";
import { discoverGenericInvoiceFieldCandidates } from "../candidates/genericInvoiceCandidateDiscovery.js";
import { discoverInvoiceHeaderPartyFieldCandidates } from "../candidates/invoiceHeaderPartyCandidateDiscovery.js";
import { discoverInvoiceCommercialTermsFieldCandidates } from "../candidates/invoiceCommercialTermsCandidateDiscovery.js";
import { discoverInvoiceShipmentFieldCandidates } from "../candidates/invoiceShipmentCandidateDiscovery.js";
import { validateGenericInvoiceEvidence } from "../validator/genericInvoiceEvidenceValidator.js";
import { planInvoiceAdaptiveRecovery } from "./invoiceAdaptiveRecoveryOrchestrator.js";
import {
  executeInvoiceAdaptiveGoodsCodeRecovery,
  executeInvoiceAdaptiveGoodsDescriptionRecovery,
  executeInvoiceAdaptiveGoodsNumericRecovery,
  executeInvoiceAdaptiveScalarRecovery
} from "./invoiceAdaptiveRecoveryExecution.js";

const REQUESTED_FIELDS = [
  "invoiceNumber", "invoiceDate", "seller", "sellerAddress", "sellerCountry",
  "buyer", "buyerAddress", "buyerCountry", "currency", "totalAmount", "deliveryTerm",
  "paymentType", "transportMode", "origin", "exitCountry", "arrivalCountry", "destinationCountry",
  "tradeCountry", "carrier", "departureVehicleId", "borderVehicleId", "vehiclePlate", "containerNo",
  "billOfLadingNo", "cmrNo", "awbNo", "transportDocumentNo", "exchangeRate", "freight", "insurance",
  "bankInfo", "packageType", "totalPackage", "grossKg", "netKg", "previousDocumentNo",
  "circulationDocumentNo", "originDocumentNo",
  "goodsLines[].productCode", "goodsLines[].description", "goodsLines[].hsCode",
  "goodsLines[].quantity", "goodsLines[].unit", "goodsLines[].unitPrice",
  "goodsLines[].lineTotal", "goodsLines[].origin"
];

export function canonicalCommercialTermsCandidatesOf(data: Record<string, unknown> | undefined): FieldCandidateEnvelope {
  const audit = data?.genericCandidateAudit as { commercialTermsCandidates?: FieldCandidateEnvelope } | undefined;
  const source = audit?.commercialTermsCandidates;
  if (source?.version !== "1" || !source.fields) return { version: "1", fields: {} };

  const fields: Record<string, FieldCandidateEnvelope["fields"][string]> = {};
  for (const [field, candidates] of Object.entries(source.fields)) {
    // The generic commercial-terms discovery predates the declaration/F6
    // vocabulary. Promote only the source-backed delivery term here; the
    // original shadow audit remains untouched.
    const target = field === "trade.deliveryTerm" ? "deliveryTerm"
      : field === "finance.bankInfo" ? "bankInfo"
      : field === "trade.paymentType" ? "paymentType"
      : field === "finance.freight" ? "freight"
      : field === "finance.insurance" ? "insurance"
      : field === "header.totalAmount" ? "totalAmount"
      : field === "header.currency" ? "currency"
      : field === "finance.exchangeRate" ? "exchangeRate"
      : field === "transport.mode" ? "transportMode"
      : undefined;
    if (!target) continue;
    fields[target] = candidates.map((candidate) => ({
      ...candidate,
      field: target,
      candidateId: `${candidate.candidateId}:f6-${target}`
    }));
  }
  return { version: "1", fields };
}

/**
 * Promote only self-proving generic GTIP evidence from the shadow audit into
 * the Foundation 6 candidate stream.  The value must be an exact 12-digit
 * token backed by its own NATIVE_TEXT evidence, and that field's evidence must
 * have passed canonical validation.  Other row problems (description, math,
 * etc.) do not invalidate a directly observed GTIP token.
 *
 * This keeps Qwen useful as a competing reader while preventing product codes
 * such as AG.SCH.* or short numeric fragments from outranking the invoice's
 * machine-readable GTIP column.
 */
export function canonicalNativeGoodsCodeCandidatesOf(data: Record<string, unknown> | undefined): FieldCandidateEnvelope {
  const audit = data?.genericCandidateAudit as {
    candidates?: FieldCandidateEnvelope;
    validation?: { rows?: Array<{ rowIndex: number; issues?: Array<{ field?: string; code?: string }> }> };
  } | undefined;
  const source = audit?.candidates;
  if (source?.version !== "1" || !source.fields) return { version: "1", fields: {} };

  const invalidEvidenceCodes = new Set([
    "MISSING_EVIDENCE",
    "INVALID_EVIDENCE_PAGE",
    "INVALID_EVIDENCE_BBOX",
    "EVIDENCE_NOT_SUPPORTED_BY_CANONICAL"
  ]);
  const invalidFields = new Set<string>();
  for (const row of audit?.validation?.rows ?? []) {
    for (const issue of row.issues ?? []) {
      if (issue.field && issue.code && invalidEvidenceCodes.has(issue.code)) invalidFields.add(issue.field);
    }
  }

  const fields: Record<string, FieldCandidateEnvelope["fields"][string]> = {};
  for (const [field, candidates] of Object.entries(source.fields)) {
    if (!/^goodsLines\.\d+\.hsCode$/.test(field) || invalidFields.has(field)) continue;
    const eligible = candidates.filter((candidate) => {
      const digits = String(candidate.value ?? "").replace(/\D/g, "");
      if (!/^\d{12}$/.test(digits) || candidate.derived) return false;
      return candidate.evidence.some((evidence) =>
        evidence.contentSource === "NATIVE_TEXT" &&
        typeof evidence.text === "string" &&
        evidence.text.replace(/\D/g, "") === digits
      );
    });
    if (eligible.length === 0) continue;
    fields[field] = eligible.map((candidate) => ({
      ...candidate,
      field,
      candidateId: `${candidate.candidateId}:f6-native-hs`
    }));
  }
  return { version: "1", fields };
}

/**
 * 1.8.21: Promote an entire generic goods row only when the generic evidence
 * validator marked that row VALID.  This turns the persisted shadow parser into
 * peer evidence for row-local fields without bypassing Foundation 6.  A row
 * with missing/unsupported evidence or arithmetic mismatch stays shadow-only.
 */
export function canonicalValidatedNativeGoodsRowCandidatesOf(data: Record<string, unknown> | undefined): FieldCandidateEnvelope {
  const audit = data?.genericCandidateAudit as {
    candidates?: FieldCandidateEnvelope;
    validation?: { rows?: Array<{ rowIndex: number; status?: string; issues?: unknown[] }> };
  } | undefined;
  const source = audit?.candidates;
  if (source?.version !== "1" || !source.fields) return { version: "1", fields: {} };

  const validRows = new Set(
    (audit?.validation?.rows ?? [])
      .filter((row) => row.status === "VALID" && (row.issues?.length ?? 0) === 0)
      .map((row) => row.rowIndex)
  );
  if (validRows.size === 0) return { version: "1", fields: {} };

  const fields: Record<string, FieldCandidateEnvelope["fields"][string]> = {};
  const rowField = /^goodsLines\.(\d+)\.(productCode|description|quantity|unit|unitPrice|lineTotal)$/;
  for (const [field, candidates] of Object.entries(source.fields)) {
    const match = field.match(rowField);
    if (!match || !validRows.has(Number(match[1]))) continue;
    const eligible = candidates.filter((candidate) =>
      !candidate.derived && candidate.evidence.some((evidence) => evidence.contentSource === "NATIVE_TEXT")
    );
    if (eligible.length === 0) continue;
    fields[field] = eligible.map((candidate) => ({
      ...candidate,
      field,
      candidateId: `${candidate.candidateId}:f6-native-row`
    }));
  }
  return { version: "1", fields };
}

/**
 * 1.8.34: Row-local origin is distinct from declaration-wide originCountry.
 * The generic origin discovery already binds a compact native-text origin cell
 * to a proven goods row.  Allow that evidence into Foundation 6 only when the
 * corresponding generic goods row itself passed validation.  This preserves
 * row locality and never promotes a line origin into a customs-country scalar.
 */
export function canonicalValidatedNativeGoodsOriginCandidatesOf(data: Record<string, unknown> | undefined): FieldCandidateEnvelope {
  const audit = data?.genericCandidateAudit as {
    originCandidates?: FieldCandidateEnvelope;
    validation?: { rows?: Array<{ rowIndex: number; status?: string; issues?: unknown[] }> };
  } | undefined;
  const source = audit?.originCandidates;
  if (source?.version !== "1" || !source.fields) return { version: "1", fields: {} };

  const validRows = new Set(
    (audit?.validation?.rows ?? [])
      .filter((row) => row.status === "VALID" && (row.issues?.length ?? 0) === 0)
      .map((row) => row.rowIndex)
  );
  if (validRows.size === 0) return { version: "1", fields: {} };

  const fields: Record<string, FieldCandidateEnvelope["fields"][string]> = {};
  for (const [field, candidates] of Object.entries(source.fields)) {
    const match = /^goodsLines\.(\d+)\.origin$/.exec(field);
    if (!match || !validRows.has(Number(match[1]))) continue;
    const eligible = candidates.filter((candidate) =>
      !candidate.derived &&
      candidate.evidence.some((evidence) =>
        evidence.contentSource === "NATIVE_TEXT" &&
        typeof evidence.text === "string" &&
        evidence.text.trim().length > 0
      )
    );
    if (eligible.length !== 1) continue;
    fields[field] = eligible.map((candidate) => ({
      ...candidate,
      field,
      candidateId: `${candidate.candidateId}:f6-native-origin`
    }));
  }
  return { version: "1", fields };
}

export function canonicalHeaderPartyCandidatesOf(data: Record<string, unknown> | undefined): FieldCandidateEnvelope {
  const audit = data?.genericCandidateAudit as { headerPartyCandidates?: FieldCandidateEnvelope } | undefined;
  const source = audit?.headerPartyCandidates;
  if (source?.version !== "1" || !source.fields) return { version: "1", fields: {} };

  const fields: Record<string, FieldCandidateEnvelope["fields"][string]> = {};
  const fieldMap: Readonly<Record<string, string>> = {
    "header.invoiceNo": "invoiceNo",
    "header.invoiceDate": "invoiceDate",
    "parties.seller.name": "parties.seller.name",
    "parties.seller.address": "parties.seller.address",
    "parties.seller.country": "parties.seller.country",
    "parties.buyer.name": "parties.buyer.name",
    "parties.buyer.address": "parties.buyer.address",
    "parties.buyer.country": "parties.buyer.country"
  };
  for (const [field, candidates] of Object.entries(source.fields)) {
    const target = fieldMap[field];
    if (!target) continue;
    fields[target] = candidates.map((candidate) => ({
      ...candidate,
      field: target,
      candidateId: `${candidate.candidateId}:f6-header-party`
    }));
  }
  return { version: "1", fields };
}

export function canonicalNativeShipmentCandidatesOf(data: Record<string, unknown> | undefined): FieldCandidateEnvelope {
  const audit = data?.genericCandidateAudit as { shipmentCandidates?: FieldCandidateEnvelope } | undefined;
  const source = audit?.shipmentCandidates;
  if (source?.version !== "1" || !source.fields) return { version: "1", fields: {} };

  const fieldMap: Readonly<Record<string, string>> = {
    "packageInfo.totalPackage": "totalPackage",
    "packageInfo.packageType": "packageType",
    "packageInfo.grossKg": "grossWeight",
    "packageInfo.netKg": "netWeight"
  };
  const fields: Record<string, FieldCandidateEnvelope["fields"][string]> = {};
  for (const [field, candidates] of Object.entries(source.fields)) {
    const target = fieldMap[field];
    if (!target) continue;
    const eligible = candidates.filter((candidate) =>
      !candidate.derived && candidate.evidence.some((evidence) => evidence.contentSource === "NATIVE_TEXT")
    );
    if (!eligible.length) continue;
    fields[target] = eligible.map((candidate) => ({
      ...candidate,
      field: target,
      candidateId: `${candidate.candidateId}:f6-native-shipment`
    }));
  }
  return { version: "1", fields };
}

/**
 * 1.8.28: rebuild the deterministic authority audit from the canonical
 * document immediately before Vision fusion. This keeps source-backed fields
 * independent of model size/provider behavior: a stronger Vision model can
 * compete with native evidence, but cannot make that evidence disappear.
 */
function currentCanonicalAuthorityData(
  data: Record<string, unknown> | undefined,
  canonicalDocument: CanonicalDocument,
  segmentId: string
): Record<string, unknown> {
  const candidates = discoverGenericInvoiceFieldCandidates(canonicalDocument, segmentId);
  return {
    ...(data ?? {}),
    genericCandidateAudit: {
      candidates,
      validation: validateGenericInvoiceEvidence(canonicalDocument, candidates),
      headerPartyCandidates: discoverInvoiceHeaderPartyFieldCandidates(canonicalDocument, segmentId),
      commercialTermsCandidates: discoverInvoiceCommercialTermsFieldCandidates(canonicalDocument, segmentId),
      shipmentCandidates: discoverInvoiceShipmentFieldCandidates(canonicalDocument, segmentId)
    }
  };
}

function canonicalPageText(canonicalDocument: CanonicalDocument, pageNumber: number): string {
  const page = canonicalDocument.pages.find((item) => item.pageNumber === pageNumber);
  if (!page) return "";
  const source = [page.nativeText ?? "", page.ocrText ?? "", ...page.words.map((word) => word.text)].join(" ");
  return source.toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I").replace(/Ç/g, "C").replace(/Ğ/g, "G").replace(/Ö/g, "O").replace(/Ş/g, "S").replace(/Ü/g, "U");
}

/**
 * 1.8.15 semantic authority is candidate-local, not document-global. A role
 * label elsewhere in a multi-page invoice must not authorize a hallucinated
 * PAGE_IMAGE value on the current page. Non-image evidence is left untouched:
 * this guard only limits the semantic-primary vision source before F6 sees it.
 */
function semanticNumericValue(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const token = raw.match(/[-+]?\d[\d.,]*/)?.[0];
  if (!token) return undefined;
  const lastComma = token.lastIndexOf(",");
  const lastDot = token.lastIndexOf(".");
  let normalized = token;
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    normalized = token.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma >= 0) {
    const decimals = token.length - lastComma - 1;
    normalized = decimals > 0 && decimals <= 6
      ? token.replace(/\./g, "").replace(",", ".")
      : token.replace(/,/g, "");
  } else if (lastDot >= 0) {
    const decimals = token.length - lastDot - 1;
    normalized = decimals > 0 && decimals <= 6
      ? token.replace(/,/g, "")
      : token.replace(/\./g, "");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * 1.8.49.1: high-risk numeric commercial scalars need source-backed semantic
 * corroboration before PAGE_IMAGE evidence can enter Foundation 6. A bare
 * numeric value is not enough to prove exchange-rate, freight, or insurance
 * role: unit prices and unrelated zero totals are common invoice numbers.
 *
 * Deterministic role-bound discovery is built from canonical native/OCR text.
 * Vision remains useful when it agrees with that evidence, while source-absent
 * values fail closed instead of silently becoming declaration facts.
 */
export function enforceVisionSourceBackedCommercialNumericAuthority(
  candidates: FieldCandidateEnvelope,
  roleBoundDeterministic: FieldCandidateEnvelope
): FieldCandidateEnvelope {
  const fields: FieldCandidateEnvelope["fields"] = { ...candidates.fields };
  const protectedFields = ["exchangeRate", "freight", "insurance"] as const;

  for (const field of protectedFields) {
    const source = fields[field] ?? [];
    if (source.length === 0) continue;
    const authorities = roleBoundDeterministic.fields[field] ?? [];
    const authorityNumbers = authorities
      .map((candidate) => semanticNumericValue(candidate.value))
      .filter((value): value is number => value !== undefined);

    const retained = source.filter((candidate) => {
      const isVisionOnly = candidate.evidence.length > 0
        && candidate.evidence.every((evidence) => evidence.contentSource === "PAGE_IMAGE");
      if (!isVisionOnly) return true;
      const numeric = semanticNumericValue(candidate.value);
      if (numeric === undefined || authorityNumbers.length === 0) return false;
      return authorityNumbers.some((authority) => Math.abs(authority - numeric) <= 1e-9);
    });

    if (retained.length > 0) fields[field] = retained;
    else delete fields[field];
  }

  return { version: "1", fields };
}

export function sanitizeVisionCommercialSemanticCandidates(
  candidates: FieldCandidateEnvelope
): FieldCandidateEnvelope {
  const fields: FieldCandidateEnvelope["fields"] = { ...candidates.fields };
  const sanitize = (field: "paymentType" | "bankInfo", fn: (value: unknown) => unknown) => {
    const source = fields[field] ?? [];
    const retained = source.filter((candidate) => fn(candidate.value) !== undefined);
    if (retained.length > 0) fields[field] = retained;
    else delete fields[field];
  };
  // Defense in depth at the worker/F6 persistence boundary. Provider-level
  // sanitization is still useful, but resumed checkpoints and any alternate
  // Vision provider must not be able to persist a monetary amount as a
  // payment term or bank identity.
  sanitize("paymentType", sanitizeVisionPaymentType);
  sanitize("bankInfo", sanitizeVisionBankInfo);
  return { version: "1", fields };
}

export function enforceVisionDocumentRoleAuthority(
  candidates: FieldCandidateEnvelope,
  canonicalDocument: CanonicalDocument
): FieldCandidateEnvelope {
  const pageText = new Map(canonicalDocument.pages.map((page) => [page.pageNumber, canonicalPageText(canonicalDocument, page.pageNumber)]));
  const fields = { ...candidates.fields };

  const normalized = (value: unknown) => String(value ?? "")
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I").replace(/Ç/g, "C").replace(/Ğ/g, "G").replace(/Ö/g, "O").replace(/Ş/g, "S").replace(/Ü/g, "U")
    .replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();

  const valueCorroboratedOnPage = (candidate: FieldCandidateEnvelope["fields"][string][number], evidencePage: number) => {
    const value = normalized(candidate.value);
    if (value.length < 6) return false;
    return normalized(pageText.get(evidencePage) ?? "").includes(value);
  };

  const partyNameShape = (value: unknown) => {
    const text = normalized(value);
    if (text.length < 4 || /^\d/.test(text)) return false;
    if (/\b(?:CADDE|SOKAK|MAHALLE|MAAKOND|STREET|ROAD|AVENUE|NO|TEL|FAX|KARAYOLU)\b/.test(text)) return false;
    return /[A-Z]/.test(text) && /\b(?:A S|AS|LTD|LIMITED|LLC|INC|CORP|GMBH|OU|OÜ|S A|SRL|ELEKTRIK|TECHNOLOGY|TEKNOLOJI|SYSTEM|SISTEM|INDUSTRY|COMPANY)\b/.test(text);
  };

  const partyAddressShape = (value: unknown) => {
    const text = normalized(value);
    return text.length >= 8 && /\d/.test(text) && /\b(?:CADDE|SOKAK|MAHALLE|MAAKOND|STREET|ROAD|AVENUE|NO|TALLINN|ISTANBUL|TUZLA)\b/.test(text);
  };

  const roleAndValueNearOnPage = (
    candidate: FieldCandidateEnvelope["fields"][string][number],
    evidencePage: number,
    role: RegExp,
    maxGap = 16
  ) => {
    const page = normalized(pageText.get(evidencePage) ?? "");
    const value = normalized(candidate.value);
    if (!page || !value) return false;
    const roleFlags = role.flags.replace(/g/g, "");
    const localRole = new RegExp(role.source, roleFlags);
    const match = localRole.exec(page);
    if (!match) return false;
    const roleStart = match.index;
    const roleEnd = roleStart + match[0].length;
    let valueStart = page.indexOf(value);
    while (valueStart >= 0) {
      const valueEnd = valueStart + value.length;
      const gap = valueStart > roleEnd ? valueStart - roleEnd : roleStart > valueEnd ? roleStart - valueEnd : 0;
      if (gap <= maxGap) return true;
      valueStart = page.indexOf(value, valueStart + 1);
    }
    return false;
  };

  const keepOnlyWithRole = (field: string, role: RegExp, corroboration?: (candidate: FieldCandidateEnvelope["fields"][string][number], pageNumber: number) => boolean) => {
    const source = fields[field];
    if (!source?.length) return;
    const retained = source.filter((candidate) => {
      const imageEvidence = candidate.evidence.filter((evidence) => evidence.contentSource === "PAGE_IMAGE");
      if (imageEvidence.length === 0) return true;
      return imageEvidence.some((evidence) => role.test(pageText.get(evidence.pageNumber) ?? "") || Boolean(corroboration?.(candidate, evidence.pageNumber)));
    });
    if (retained.length > 0) fields[field] = retained;
    else delete fields[field];
  };

  // Document identifiers remain role-bound. The role must be present on the
  // same evidence page; a certificate label on another page cannot authorize
  // an unrelated invoice-table token.
  keepOnlyWithRole("originDocumentNo", /\b(?:MENSE\s*BELGESI|CERTIFICATE\s+OF\s+ORIGIN|ORIGIN\s+CERTIFICATE|COO)\b/);
  keepOnlyWithRole("circulationDocumentNo", /\b(?:A\.?TR\.?|EUR\.?1|CIRCULATION\s+DOCUMENT|DOLASIM\s+BELGESI)\b/);
  keepOnlyWithRole("previousDocumentNo", /\b(?:ONCEKI\s+BELGE|PREVIOUS\s+DOCUMENT)\b/);

  // Parties: repeated logos, addresses, shipment words and table text on later
  // pages are not party authority. Require an explicit seller/buyer semantic
  // role on the page that produced the vision candidate.
  const sellerRole = /\b(?:SATICI|GONDERICI|IHRACATCI|SELLER|SUPPLIER|EXPORTER|SHIPPER|ABSENDER|VERKAEUFER|VERKAUFER)\b/;
  const buyerRole = /\b(?:ALICI|MUSTERI|ITHALATCI|BUYER|CUSTOMER|IMPORTER|CONSIGNEE|BILL\s+TO|SOLD\s+TO|RECHNUNG\s+AN|KUNDE|EMPFAENGER|EMPFANGER|FIRMA\s*\/\s*ADRESSE)\b/;
  keepOnlyWithRole("parties.seller.name", sellerRole, (candidate, page) => partyNameShape(candidate.value) && valueCorroboratedOnPage(candidate, page));
  keepOnlyWithRole("parties.seller.address", sellerRole, (candidate, page) => partyAddressShape(candidate.value) && valueCorroboratedOnPage(candidate, page));
  keepOnlyWithRole("parties.seller.country", sellerRole);
  keepOnlyWithRole("parties.buyer.name", buyerRole, (candidate, page) => partyNameShape(candidate.value) && valueCorroboratedOnPage(candidate, page));
  keepOnlyWithRole("parties.buyer.address", buyerRole, (candidate, page) => partyAddressShape(candidate.value) && valueCorroboratedOnPage(candidate, page));
  keepOnlyWithRole("parties.buyer.country", buyerRole);

  // Customs-country roles are independent semantic fields. A seller/buyer address,
  // a row origin or a port/city token cannot authorize them by itself.
  keepOnlyWithRole("origin", /\b(?:MENSEI|MENSE\s*I|COUNTRY\s+OF\s+ORIGIN|ORIGIN\s+OF\s+GOODS|URSPRUNG)\b/);
  keepOnlyWithRole("exitCountry", /\b(?:CIKIS\s+ULKESI|COUNTRY\s+OF\s+(?:EXPORT|DEPARTURE))\b/);
  keepOnlyWithRole("arrivalCountry", /\b(?:VARIS\s+ULKESI|COUNTRY\s+OF\s+ARRIVAL)\b/);
  keepOnlyWithRole("destinationCountry", /\b(?:GIDECEGI\s+ULKE|COUNTRY\s+OF\s+FINAL\s+DESTINATION|FINAL\s+DESTINATION|PORT\s+OF\s+DESTINATION)\b/);
  keepOnlyWithRole("tradeCountry", /\b(?:TICARET\s+YAPILAN\s+ULKE|COUNTRY\s+OF\s+TRADE)\b/);

  // Goods origin is not the seller/buyer country. PAGE_IMAGE row origin needs
  // an explicit origin role/statement on its own evidence page.
  for (const field of Object.keys(fields)) {
    if (!/^goodsLines\.\d+\.origin$/.test(field)) continue;
    keepOnlyWithRole(field, /\b(?:MENSEI|MENSE\s*I|URSPRUG|URSPRUNG|COUNTRY\s+OF\s+ORIGIN(?:\s+OF\s+GOODS)?|ORIGIN\s+OF\s+GOODS|MADE\s+IN|MENSEILIDIR)\b/);
  }

  // Header/shipment scalars that are especially prone to numeric-role
  // collisions. Quantity/price values must not become invoice totals or
  // weights merely because the VLM returned the requested JSON key.
  keepOnlyWithRole("totalAmount", /\b(?:FATURA\s+TOPLAMI|GENEL\s+TOPLAM|ODENECEK\s+TUTAR|INVOICE\s+TOTAL|GRAND\s+TOTAL|TOTAL\s+AMOUNT|AMOUNT\s+DUE)\b/);
  keepOnlyWithRole("grossWeight", /\b(?:BRUT|BRUTTO|GROSS)\s*(?:AGIRLIK|WEIGHT|KG)?\b|\b(?:GROSS\s+WEIGHT|BRUT\s+AGIRLIK)\b/);
  keepOnlyWithRole("netWeight", /\b(?:NET)\s*(?:AGIRLIK|WEIGHT|KG)\b|\b(?:NET\s+WEIGHT|NET\s+AGIRLIK)\b/);
  const packageTypeRole = /\b(?:AMBALAJ|KAP\s+CINSI|PAKET\s+TIPI|PACKAGE\s+TYPE|PACKAGING|PACKING\s+TYPE)\b/;
  const totalPackageRole = /\b(?:TOPLAM\s+KAP|KAP\s+ADEDI|PAKET\s+ADEDI|TOTAL\s+PACKAGES?|PACKAGE\s+COUNT|NUMBER\s+OF\s+PACKAGES?)\b/;
  // 1.8.26: a package label somewhere on a dense page is not enough to
  // authorize an arbitrary VLM value from that page. The value itself must be
  // visible close to the semantic role. This remains document-generic and also
  // works for short legitimate values such as BOX/BAG because proximity, not
  // string length or a supplier vocabulary, is the authority condition.
  const keepOnlyWithRoleLocalValue = (field: string, role: RegExp) => {
    const source = fields[field];
    if (!source?.length) return;
    const retained = source.filter((candidate) => {
      const imageEvidence = candidate.evidence.filter((evidence) => evidence.contentSource === "PAGE_IMAGE");
      if (imageEvidence.length === 0) return true;
      return imageEvidence.some((evidence) => roleAndValueNearOnPage(candidate, evidence.pageNumber, role));
    });
    if (retained.length > 0) fields[field] = retained;
    else delete fields[field];
  };
  keepOnlyWithRoleLocalValue("packageType", packageTypeRole);
  keepOnlyWithRoleLocalValue("totalPackage", totalPackageRole);

  // Transport/document identifiers are high-risk scalars. Dense invoice tables
  // contain many short numeric tokens (for example quantity=2) that a VLM can
  // otherwise repeat into every transport slot. Explicit same-page role proof
  // is required; absence means fail closed, never "single candidate = truth".
  keepOnlyWithRole("transportMode", /\b(?:TASIMA\s+SEKLI|NAKLIYE\s+SEKLI|TRANSPORT(?:ATION)?\s+MODE|MODE\s+OF\s+TRANSPORT)\b/);
  keepOnlyWithRole("carrier", /\b(?:TASIYICI|NAKLIYECI|CARRIER|FORWARDER|FREIGHT\s+FORWARDER)\b/);
  keepOnlyWithRole("departureVehicleId", /\b(?:CIKIS\s+ARACI|DEPARTURE\s+VEHICLE|VEHICLE\s+AT\s+DEPARTURE)\b/);
  keepOnlyWithRole("borderVehicleId", /\b(?:SINIR\s+GECIS\s+ARACI|BORDER\s+(?:CROSSING\s+)?VEHICLE)\b/);
  keepOnlyWithRole("vehiclePlate", /\b(?:PLAKA|VEHICLE\s+(?:PLATE|REGISTRATION)|LICENSE\s+PLATE)\b/);
  keepOnlyWithRole("containerNo", /\b(?:KONTEYNER\s*(?:NO|NUMARASI)|CONTAINER\s*(?:NO|NUMBER|#))\b/);
  keepOnlyWithRole("billOfLadingNo", /\b(?:KONSIMENTO\s*(?:NO|NUMARASI)|BILL\s+OF\s+LADING|B\/?L\s*(?:NO|NUMBER|#))\b/);
  keepOnlyWithRole("cmrNo", /\bCMR\s*(?:NO|NUMBER|#)\b/);
  keepOnlyWithRole("awbNo", /\b(?:AWB|AIR\s+WAYBILL)\s*(?:NO|NUMBER|#)\b/);
  keepOnlyWithRole("transportDocumentNo", /\b(?:TASIMA\s+SENEDI|TRANSPORT\s+DOCUMENT|WAYBILL)\s*(?:NO|NUMBER|#)?\b/);

  // 1.8.48: 12 digits are a shape, not a semantic role. A phone/EPCG/registry
  // number returned by Vision must not become a GTIP merely because it has the
  // right length. Native deterministic GTIP authority is handled separately;
  // PAGE_IMAGE HS candidates require an explicit customs-code role on their
  // evidence page.
  for (const [field, source] of Object.entries(fields)) {
    if (!/^goodsLines\.\d+\.hsCode$/.test(field) || !source?.length) continue;
    const retained = source.filter((candidate) => {
      const imageEvidence = candidate.evidence.filter((evidence) => evidence.contentSource === "PAGE_IMAGE");
      if (imageEvidence.length === 0) return true;
      return imageEvidence.some((evidence) => {
        // A nearby customs label is not sufficient when the value itself is
        // explicitly bound to another identifier role. Dense invoices often
        // place HSN/GTIP, EPCG/LUT, telephone, IBAN and registry numbers on the
        // same page. Prefer the role local to the value and fail closed on a
        // conflicting explicit role.
        const conflictingIdentifierRole = /\b(?:TEL(?:EPHONE)?|PHONE|FAX|EPCG|LUT|IBAN|SWIFT|BIC|ACCOUNT|HESAP|VKN|TCKN|MERSIS|TICARET\s+SICIL|REGISTRY|TAX\s+(?:NO|NUMBER|ID))\b/;
        if (roleAndValueNearOnPage(candidate, evidence.pageNumber, conflictingIdentifierRole, 16)) return false;
        return roleAndValueNearOnPage(
          candidate,
          evidence.pageNumber,
          /\b(?:GTIP|G\.?T\.?I\.?P|HSN|HS\s*(?:CODE|NO|NUMBER)?|TARIFF\s*(?:CODE|NO|NUMBER)?|CUSTOMS\s*(?:CODE|TARIFF)?)\b/,
          48
        );
      });
    });
    if (retained.length) fields[field] = retained;
    else delete fields[field];
  }
  return { version: "1", fields };
}

/**
 * 1.8.48: when canonical native evidence proves a contiguous goods table, do
 * not let PAGE_IMAGE recovery append synthetic rows after that table. This is
 * deliberately one-way: it never invents a missing row and it does not trim
 * invoices for which native evidence proves no goods rows at all.
 */
/**
 * 1.8.48.2: validated native goods-row evidence is authoritative for the
 * numeric/core field it actually proves. Vision remains available for fields
 * that native evidence cannot prove, but it cannot replace a proven row-local
 * quantity/price/amount/unit/description/GTIP/origin with a PAGE_IMAGE value
 * from a neighbouring package/summary/amount column.
 *
 * This is field-local and document-generic: no supplier/layout constants and
 * no row is invented.
 */
export function enforceValidatedNativeGoodsFieldAuthority(
  candidates: FieldCandidateEnvelope,
  nativeAuthority: FieldCandidateEnvelope
): FieldCandidateEnvelope {
  const fields: FieldCandidateEnvelope["fields"] = { ...candidates.fields };
  const authoritativeField = /^goodsLines\.\d+\.(?:hsCode|description|quantity|unit|unitPrice|lineTotal|origin)$/;
  for (const [field, nativeCandidates] of Object.entries(nativeAuthority.fields)) {
    if (!authoritativeField.test(field) || !nativeCandidates?.length) continue;
    const provenNative = nativeCandidates.filter((candidate) =>
      candidate.evidence?.some((evidence) => evidence.contentSource === "NATIVE_TEXT" || evidence.contentSource === "OCR")
    );
    if (!provenNative.length) continue;
    const current = fields[field] ?? [];
    const nonImage = current.filter((candidate) =>
      candidate.evidence?.some((evidence) => evidence.contentSource !== "PAGE_IMAGE")
    );
    const merged = [...nonImage];
    for (const candidate of provenNative) {
      if (!merged.some((existing) => existing.candidateId === candidate.candidateId)) merged.push(candidate);
    }
    fields[field] = merged;
  }
  return { version: "1", fields };
}

export function enforceVisionGoodsRowBoundary(
  candidates: FieldCandidateEnvelope,
  nativeAuthority: FieldCandidateEnvelope
): FieldCandidateEnvelope {
  const nativeRows = [...new Set(Object.keys(nativeAuthority.fields).flatMap((field) => {
    const match = /^goodsLines\.(\d+)\.hsCode$/.exec(field);
    return match ? [Number(match[1])] : [];
  }))].sort((a, b) => a - b);
  if (!nativeRows.length || nativeRows.some((row, index) => row !== index)) return candidates;
  const maxNativeRow = nativeRows[nativeRows.length - 1]!;
  const fields: FieldCandidateEnvelope["fields"] = { ...candidates.fields };
  for (const [field, source] of Object.entries(fields)) {
    const match = /^goodsLines\.(\d+)\./.exec(field);
    if (!match || Number(match[1]) <= maxNativeRow || !source?.length) continue;
    const retained = source.filter((candidate) =>
      candidate.evidence.some((evidence) => evidence.contentSource !== "PAGE_IMAGE")
    );
    if (retained.length) fields[field] = retained;
    else delete fields[field];
  }
  return { version: "1", fields };
}

function fieldCandidatesOf(data: Record<string, unknown> | undefined): FieldCandidateEnvelope {
  const value = data?.fieldCandidates as FieldCandidateEnvelope | undefined;
  return value?.version === "1" && value.fields ? value : { version: "1", fields: {} };
}

/**
 * Production worker bridge. Under the 1.6.7 LLM-first route, bounded page
 * Vision is the primary semantic candidate source. Deterministic Native/OCR
 * candidates are retained only as field-level fallback when Vision emitted no
 * candidate for that field. The existing F6 resolver remains the validation/
 * promotion authority and this function never writes normalizedData.
 *
 * Vision page failures are audit data and permit degraded deterministic fallback.
 */
export async function fuseInvoiceVisionIntoWorkerCandidates(params: {
  pdfPath: string;
  canonicalDocument: CanonicalDocument;
  segments: DocumentSegment[];
  classifications: SegmentClassification[];
  candidateEnvelope: CandidateExtractionEnvelope;
  visionCheckpoint?: unknown;
  persistVisionCheckpoint?: (checkpoint: PersistedInvoiceVisionCheckpoint) => Promise<void>;
  persistModelExtractionArtifact?: (artifact: InvoiceLlmExtractionArtifact) => Promise<void>;
  /** Injectable seams for deterministic recovery verification; production callers omit these. */
  visionProvider?: InvoiceLlmExtractionProvider;
  renderVisionPage?: InvoiceVisionPageRenderer;
  visionModelIdentity?: string;
  /** Uploaded-file authority may rescue an UNKNOWN segment as an invoice. */
  forceInvoiceExecution?: boolean;
}): Promise<CandidateExtractionEnvelope> {
  const plan = planInvoiceProductionExtraction({
    canonicalDocument: params.canonicalDocument,
    llmEnabled: env.llmEnabled,
    visionLlmAvailable: env.llmVisionEnabled && Boolean(env.llmVisionModel.trim()),
    pageImagesAvailable: Boolean(params.pdfPath)
  });
  if (!plan.runVision) return params.candidateEnvelope;

  const classificationBySegment = new Map(params.classifications.map((item) => [item.segmentId, item]));
  const segmentById = new Map(params.segments.map((item) => [item.segmentId, item]));
  const provider = params.visionProvider ?? new QwenVisionInvoiceProvider();
  const visionModelIdentity = params.visionModelIdentity ?? env.llmVisionModel.trim();
  const executionKey = [
    "invoice-vision-v1",
    provider.name,
    visionModelIdentity,
    [...REQUESTED_FIELDS].sort().join(",")
  ].join("|");
  const { checkpoint: persistedCheckpoint } = prepareInvoiceVisionCheckpoint(
    params.visionCheckpoint,
    executionKey
  );

  for (const result of params.candidateEnvelope.segments) {
    const classification = classificationBySegment.get(result.segmentId);
    const segment = segmentById.get(result.segmentId);
    if (!classification || !segment) continue;
    // Uploaded-file document type is the worker's authoritative routing input.
    // Once the worker has entered the INVOICE path, a segment classifier miss
    // must not suppress the semantic-primary model call. 1.6.8.2 rescued only
    // UNKNOWN; the real holdout showed that a confident *wrong* non-INVOICE
    // classification can otherwise still complete deterministically with no
    // Qwen artifact. Non-INVOICE worker callers do not set forceInvoiceExecution.
    const invoiceSegment = classification.documentType === ClassifiedDocumentType.INVOICE
      || params.forceInvoiceExecution === true;
    if (!invoiceSegment) continue;

    // Vision is the semantic primary path, so it must not depend on a
    // deterministic extractor having populated data first.
    if (!result.data) result.data = {};

    const segmentCheckpoint = persistedCheckpoint.segments[result.segmentId] ?? { pages: {} };
    persistedCheckpoint.segments[result.segmentId] = segmentCheckpoint;
    const completedPages = Object.fromEntries(
      Object.values(segmentCheckpoint.pages)
        .filter((page) => page.status === "COMPLETED" && page.candidates && page.decision && typeof page.candidateCount === "number")
        .map((page) => [page.pageNumber, {
          candidates: page.candidates!,
          decision: page.decision!,
          candidateCount: page.candidateCount!,
          extractionArtifact: page.extractionArtifact
        }])
    );

    const execution = await executeInvoiceVisionByPage({
      canonicalDocument: params.canonicalDocument,
      segmentId: result.segmentId,
      pageNumbers: [...segment.pageNumbers],
      provider,
      renderPage: params.renderVisionPage ?? (async (pageNumber) => (await renderInvoicePagesForVision(params.pdfPath, [pageNumber]))[0]!),
      request: {
        version: "1",
        requestedFields: REQUESTED_FIELDS,
        nativeText: "",
        ocrText: "",
        verifiedKnowledge: []
      },
      completedPages,
      onPageCheckpoint: async (page) => {
        segmentCheckpoint.pages[String(page.pageNumber)] = {
          status: page.status,
          pageNumber: page.pageNumber,
          decision: page.decision,
          candidateCount: page.candidateCount,
          candidates: page.candidates,
          extractionArtifact: page.extractionArtifact,
          recoveryDiagnostic: page.recoveryDiagnostic,
          error: page.error
        };
        await params.persistVisionCheckpoint?.(persistedCheckpoint);
        if (page.status === "COMPLETED") {
          const artifacts = page.extractionArtifacts?.length
            ? page.extractionArtifacts
            : page.extractionArtifact ? [page.extractionArtifact] : [];
          for (const artifact of artifacts) {
            await params.persistModelExtractionArtifact?.(artifact);
          }
        }
      }
    });

    // 1.6.8.4: LLM-first means the semantic primary path cannot silently
    // degrade to deterministic-only extraction when every Qwen page failed.
    // Partial page success is still recoverable/checkpointed, but zero successful
    // model artifacts is a hard runtime failure so the worker exposes the real
    // render/provider/network error instead of incorrectly completing the run.
    const successfulModelArtifacts = execution.checkpoints.filter((checkpoint) => Boolean(checkpoint.extractionArtifact));
    if (successfulModelArtifacts.length === 0) {
      const failureSummary = execution.failedPages.length > 0
        ? execution.failedPages.map((page) => `page ${page.pageNumber}: ${page.error}`).join(" | ")
        : "Qwen returned no persisted extraction artifact";
      throw new Error(`LLM_VISION_PRIMARY_REQUIRED: ${failureSummary}`);
    }

    // 1.8.17: role-bound deterministic commercial/header evidence must remain a
    // peer candidate even when Vision produced the same field. Treating it as a
    // fallback hid the explicit native invoice-total candidate whenever Qwen
    // emitted any total at all, so Foundation 6 never got the evidence it is
    // designed to authorize. Legacy/general deterministic extraction remains a
    // true fallback; role-bound evidence is merged after primary selection.
    const deterministicFallback = fieldCandidatesOf(result.data);
    const currentAuthorityData = currentCanonicalAuthorityData(result.data, params.canonicalDocument, result.segmentId);
    const roleBoundDeterministic = mergeInvoiceCandidateSources(
      canonicalCommercialTermsCandidatesOf(currentAuthorityData),
      canonicalHeaderPartyCandidatesOf(currentAuthorityData),
      canonicalNativeShipmentCandidatesOf(currentAuthorityData),
      canonicalNativeGoodsCodeCandidatesOf(currentAuthorityData),
      canonicalValidatedNativeGoodsRowCandidatesOf(currentAuthorityData),
      canonicalValidatedNativeGoodsOriginCandidatesOf(currentAuthorityData)
    );
    const guardedVisionCandidates = enforceVisionSourceBackedCommercialNumericAuthority(
      enforceVisionDocumentRoleAuthority(
        sanitizeVisionCommercialSemanticCandidates(execution.candidates),
        params.canonicalDocument
      ),
      roleBoundDeterministic
    );
    const primaryFused = plan.route === "LLM_VISION_PRIMARY"
      ? mergeInvoicePrimaryWithFallback(guardedVisionCandidates, deterministicFallback)
      : mergeInvoiceCandidateSources(deterministicFallback, guardedVisionCandidates);
    const fusedCandidates = mergeInvoiceCandidateSources(primaryFused, roleBoundDeterministic);

    const associatedCandidates = associateExplicitGoodsUnitsFromQuantity({
      canonicalDocument: params.canonicalDocument,
      segmentId: result.segmentId,
      candidates: fusedCandidates
    });
    const adaptiveRecoveryPlan = planInvoiceAdaptiveRecovery(associatedCandidates);
    const adaptiveRecoveryExecution = await executeInvoiceAdaptiveScalarRecovery({
      canonicalDocument: params.canonicalDocument,
      segmentId: result.segmentId,
      pageNumbers: [...segment.pageNumbers],
      plan: adaptiveRecoveryPlan,
      currentCandidates: associatedCandidates,
      provider,
      renderPage: params.renderVisionPage ?? (async (pageNumber) => (await renderInvoicePagesForVision(params.pdfPath, [pageNumber]))[0]!),
      persistModelExtractionArtifact: params.persistModelExtractionArtifact
    });

    const adaptiveGoodsDescriptionExecution = await executeInvoiceAdaptiveGoodsDescriptionRecovery({
      canonicalDocument: params.canonicalDocument,
      segmentId: result.segmentId,
      pageNumbers: [...segment.pageNumbers],
      plan: adaptiveRecoveryPlan,
      currentCandidates: adaptiveRecoveryExecution.candidates,
      provider,
      renderPage: params.renderVisionPage ?? (async (pageNumber) => (await renderInvoicePagesForVision(params.pdfPath, [pageNumber]))[0]!),
      persistModelExtractionArtifact: params.persistModelExtractionArtifact
    });

    const adaptiveGoodsCodeExecution = await executeInvoiceAdaptiveGoodsCodeRecovery({
      canonicalDocument: params.canonicalDocument,
      segmentId: result.segmentId,
      pageNumbers: [...segment.pageNumbers],
      plan: adaptiveRecoveryPlan,
      currentCandidates: adaptiveGoodsDescriptionExecution.candidates,
      provider,
      renderPage: params.renderVisionPage ?? (async (pageNumber) => (await renderInvoicePagesForVision(params.pdfPath, [pageNumber]))[0]!),
      persistModelExtractionArtifact: params.persistModelExtractionArtifact
    });

    const adaptiveGoodsNumericExecution = await executeInvoiceAdaptiveGoodsNumericRecovery({
      canonicalDocument: params.canonicalDocument,
      segmentId: result.segmentId,
      pageNumbers: [...segment.pageNumbers],
      plan: adaptiveRecoveryPlan,
      currentCandidates: adaptiveGoodsCodeExecution.candidates,
      provider,
      renderPage: params.renderVisionPage ?? (async (pageNumber) => (await renderInvoicePagesForVision(params.pdfPath, [pageNumber]))[0]!),
      persistModelExtractionArtifact: params.persistModelExtractionArtifact
    });

    // 1.8.16: adaptive recovery is another PAGE_IMAGE candidate source. The
    // semantic-role guard must therefore be the final Vision boundary, not only
    // a pre-recovery filter; otherwise a focused recovery call can reintroduce
    // the same unsupported scalar that the primary pass correctly rejected.
    const finalRoleGuardedCandidates = enforceValidatedNativeGoodsFieldAuthority(
      enforceVisionGoodsRowBoundary(
        enforceVisionSourceBackedCommercialNumericAuthority(
          enforceVisionDocumentRoleAuthority(
            sanitizeVisionCommercialSemanticCandidates(adaptiveGoodsNumericExecution.candidates),
            params.canonicalDocument
          ),
          roleBoundDeterministic
        ),
        roleBoundDeterministic
      ),
      roleBoundDeterministic
    );

    const foundation8EvidenceBundle = {
      documentId: result.segmentId,
      evidence: params.canonicalDocument.pages
        .filter((page) => segment.pageNumbers.includes(page.pageNumber))
        .map((page) => ({
          pageNumber: page.pageNumber,
          source: page.hasNativeText ? "NATIVE_TEXT" as const : "OCR" as const,
          quote: (page.nativeText || page.ocrText || "").slice(0, 240) || undefined
        })),
      canonicalPages: params.canonicalDocument.pages
        .filter((page) => segment.pageNumbers.includes(page.pageNumber))
        .map((page) => ({
          pageNumber: page.pageNumber,
          source: page.hasNativeText ? "NATIVE_TEXT" as const : "OCR" as const,
          text: page.nativeText || page.ocrText || ""
        })),
      canonicalText: params.canonicalDocument.pages
        .filter((page) => segment.pageNumbers.includes(page.pageNumber))
        .map((page) => page.nativeText || page.ocrText || "")
        .join("\n")
    };
    const foundation8ShadowAudit = runFoundation8ShadowRuntime({
      documentId: result.segmentId,
      candidates: finalRoleGuardedCandidates,
      evidenceBundle: foundation8EvidenceBundle
    });
    const foundation8SpecialistModelAudit = env.foundation8ShadowModelEnabled
      ? await executeFoundation8SpecialistModelShadow({ bundle: foundation8EvidenceBundle, provider: createFoundation8SpecialistProvider() })
      : undefined;
    const foundation8SpecialistReconciliationAudit = foundation8SpecialistModelAudit
      ? reconcileFoundation8SpecialistModelShadow({ documentId: result.segmentId, audit: foundation8SpecialistModelAudit })
      : undefined;
    // 8.17: promotion safety is domain-local. A failed/review-required GOODS call
    // must fail closed for GOODS, but it must not erase independently grounded
    // PARTIES / COMMERCIAL / LOGISTICS specialist work.
    const foundation8PromotableDomains = new Set(
      (foundation8SpecialistModelAudit?.specialists ?? [])
        .filter(item => item.status === "COMPLETED" && item.response?.decision !== "REVIEW_REQUIRED")
        .map(item => item.domain)
    );
    // 8.22: GOODS promotion is table-atomic, not merely specialist-call-local.
    // Healthy chunk output remains in the audit/reconciliation artifact, but an
    // incomplete table or targeted GOODS recovery cannot partially overwrite
    // legacy rows and create a mixed-authority goods table.
    if (foundation8SpecialistReconciliationAudit?.recoveryDomains.includes("GOODS")) {
      foundation8PromotableDomains.delete("GOODS");
    }
    const foundation8ReconciledCandidates = env.foundation8ReconciledPromotionEnabled && foundation8SpecialistReconciliationAudit
      ? bridgeReconciledFoundation8ToCandidates({
          segmentId: result.segmentId,
          reconciliation: foundation8SpecialistReconciliationAudit,
          promotableDomains: foundation8PromotableDomains
        })
      : { version: "1" as const, fields: {} };
    const productionCandidates = env.foundation8ReconciledPromotionEnabled
      ? overlayReconciledFoundation8Candidates(finalRoleGuardedCandidates, foundation8ReconciledCandidates)
      : finalRoleGuardedCandidates;

    result.data = {
      ...result.data,
      fieldCandidates: productionCandidates,
      foundation8ShadowAudit,
      ...(foundation8SpecialistModelAudit ? { foundation8SpecialistModelAudit } : {}),
      ...(foundation8SpecialistReconciliationAudit ? { foundation8SpecialistReconciliationAudit } : {}),
      ...(env.foundation8ReconciledPromotionEnabled ? { foundation8ReconciledPromotionAudit: { version: "8.17.0", promotableDomains: [...foundation8PromotableDomains].sort(), promotedFields: Object.keys(foundation8ReconciledCandidates.fields).sort() } } : {}),
      adaptiveRecoveryAudit: adaptiveRecoveryPlan,
      adaptiveRecoveryExecutionAudit: adaptiveRecoveryExecution.audit,
      adaptiveGoodsDescriptionExecutionAudit: adaptiveGoodsDescriptionExecution.audit,
      adaptiveGoodsCodeExecutionAudit: adaptiveGoodsCodeExecution.audit,
      adaptiveGoodsNumericExecutionAudit: adaptiveGoodsNumericExecution.audit,
      visionCandidateAudit: {
        route: plan.route,
        checkpoints: execution.checkpoints,
        failedPages: execution.failedPages
      }
    };
  }

  return params.candidateEnvelope;
}
