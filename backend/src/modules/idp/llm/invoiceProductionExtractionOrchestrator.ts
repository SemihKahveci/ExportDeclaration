import { createHash } from "node:crypto";
import type { CanonicalDocument } from "../domain/canonicalDocument.types.js";
import type { FieldCandidate, FieldCandidateEnvelope } from "../domain/fieldCandidate.types.js";
import type { InvoiceLlmExtractionResponse } from "../domain/invoiceLlmExtraction.types.js";
import {
  chooseInvoiceExtractionRoute,
  InvoiceEvidenceQuality,
  type InvoiceEvidenceQualityValue,
  type InvoiceExtractionRouteValue
} from "./invoiceLlmExtractionPolicy.js";

const VISION_EXTRACTOR = "invoice-qwen-vision-v1";
const GOODS_PREFIX = "goodsLines[].";

const VISION_TO_DECLARATION_FIELD: Readonly<Record<string, string>> = {
  invoiceNumber: "invoiceNo",
  seller: "parties.seller.name",
  sellerAddress: "parties.seller.address",
  sellerCountry: "parties.seller.country",
  buyer: "parties.buyer.name",
  buyerAddress: "parties.buyer.address",
  buyerCountry: "parties.buyer.country",
  origin: "originCountry",
  totalPackage: "totalPackage",
  grossKg: "grossWeight",
  netKg: "netWeight"
};

function declarationFieldName(visionField: string): string {
  return VISION_TO_DECLARATION_FIELD[visionField] ?? visionField;
}

const NUMERIC_INVOICE_FIELDS = new Set([
  "grossKg",
  "netKg",
  "totalAmount",
  "totalPackage",
  "exchangeRate",
  "freight",
  "insurance",
  "goodsLines[].quantity",
  "goodsLines[].unitPrice",
  "goodsLines[].lineTotal"
]);

/**
 * Common Vision→F6 semantic boundary normalization. Identity and Incoterm
 * canonicalization are deliberately narrow; numeric parsing preserves the
 * existing conservative behavior. Unsupported values remain unchanged or are
 * omitted so the existing Foundation 6 validation/review path stays fail-closed.
 */
const INCOTERMS_2020 = ["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP", "FAS", "FOB", "CFR", "CIF"] as const;

const INVOICE_NUMBER_DATE_SUFFIX = String.raw`(?:\d{1,2}[-/.](?:\d{1,2}|[A-Za-z]{3,9})[-/.]\d{2,4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})`;

function splitInvoiceNumberDateSuffix(value: string): { invoiceNumber: string; dateToken?: string } {
  const trimmed = value.trim();
  const match = trimmed.match(new RegExp(`^(.+?)\\s*(?:&|\\||;)\\s*(${INVOICE_NUMBER_DATE_SUFFIX})\\s*$`, "i"));
  return match?.[1]
    ? { invoiceNumber: match[1].trim(), dateToken: match[2]?.trim() }
    : { invoiceNumber: trimmed };
}

function validIsoDate(year: number, month: number, day: number): string | undefined {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function canonicalInvoiceDateSuffix(token: string | undefined): string | undefined {
  if (!token) return undefined;
  const raw = token.trim();

  let match = raw.match(/^(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) return validIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));

  const monthNames: Readonly<Record<string, number>> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
    oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
  };
  match = raw.match(/^(\d{1,2})[-/.]([A-Za-z]{3,9})[-/.](\d{2}|\d{4})$/);
  if (match) {
    const month = monthNames[match[2]!.toLowerCase()];
    const yearToken = Number(match[3]);
    const year = match[3]!.length === 2 ? 2000 + yearToken : yearToken;
    if (month) return validIsoDate(year, month, Number(match[1]));
  }

  // Numeric D/M/Y is only promoted when it is unambiguous. 04/05/2026 could
  // be either April 5 or 4 May, so it deliberately remains unresolved.
  match = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})$/);
  if (match && Number(match[1]) > 12) {
    return validIsoDate(Number(match[3]), Number(match[2]), Number(match[1]));
  }
  return undefined;
}

function canonicalVisionInvoiceNumber(value: string): string {
  // Some VLM responses concatenate a neighboring invoice date into the identifier
  // (for example "P0087/26-27 & 16-Sep-26"). Strip only an explicitly separated,
  // date-shaped suffix; arbitrary foreign invoice identifiers remain untouched.
  return splitInvoiceNumberDateSuffix(value).invoiceNumber;
}

function canonicalVisionDeliveryTerm(value: string): string | undefined {
  const upper = value.trim().toUpperCase();
  if (!upper) return undefined;
  // Delivery terms are a closed Incoterms 2020 vocabulary at this boundary.
  // Location/payment suffixes are allowed ("FOB SHANGHAI", "DAP-30 DAYS"),
  // but unrelated commercial tokens such as FOC must never become deliveryTerm.
  return INCOTERMS_2020.find((term) => new RegExp(`(?:^|[^A-Z])${term}(?:$|[^A-Z])`).test(upper));
}

export function canonicalVisionValue(field: string, value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (field === "invoiceNumber") return canonicalVisionInvoiceNumber(value);
  if (field === "deliveryTerm") return canonicalVisionDeliveryTerm(value);
  if (!NUMERIC_INVOICE_FIELDS.has(field)) return value;
  let raw = value.trim();
  if (!raw) return value;

  raw = raw.replace(/\s+/g, "");
  // Apostrophe/right-single-quote grouping is common in Swiss/German commercial
  // documents (for example 10'500.00 or 10’500.00). Treat it strictly as a
  // thousands separator only when it forms canonical 3-digit groups.
  if (/^[+-]?\d{1,3}(?:['’]\d{3})+(?:[.,]\d+)?(?:[A-Za-z%]+)?$/.test(raw)) {
    raw = raw.replace(/['’]/g, "");
  }
  const match = raw.match(/^([+-]?[0-9][0-9.,]*)(?:[A-Za-z%]+)?$/);
  if (!match) return value;
  let numeric = match[1]!;

  const lastDot = numeric.lastIndexOf(".");
  const lastComma = numeric.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? "." : ",";
    const grouping = decimal === "." ? "," : ".";
    numeric = numeric.split(grouping).join("");
    if (decimal === ",") numeric = numeric.replace(",", ".");
  } else if (lastComma >= 0) {
    const decimals = numeric.length - lastComma - 1;
    numeric = decimals === 3 && /^\d{1,3}(?:,\d{3})+$/.test(numeric)
      ? numeric.replace(/,/g, "")
      : numeric.replace(",", ".");
  } else if (lastDot >= 0) {
    const decimals = numeric.length - lastDot - 1;
    if (decimals === 3 && /^\d{1,3}(?:\.\d{3})+$/.test(numeric)) {
      numeric = numeric.replace(/\./g, "");
    }
  }

  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : value;
}

export interface InvoiceProductionExtractionPlan {
  route: InvoiceExtractionRouteValue;
  nativeTextQuality: InvoiceEvidenceQualityValue;
  ocrQuality: InvoiceEvidenceQualityValue;
  pageImagesAvailable: boolean;
  runDeterministic: boolean;
  runVision: boolean;
  visionPageNumbers: number[];
}

function quality(charCount: number, wordCount: number): InvoiceEvidenceQualityValue {
  if (charCount <= 0 || wordCount <= 0) return InvoiceEvidenceQuality.UNAVAILABLE;
  if (charCount >= 250 && wordCount >= 40) return InvoiceEvidenceQuality.HIGH;
  if (charCount >= 80 && wordCount >= 15) return InvoiceEvidenceQuality.MEDIUM;
  return InvoiceEvidenceQuality.LOW;
}

export function planInvoiceProductionExtraction(params: {
  canonicalDocument: CanonicalDocument;
  llmEnabled: boolean;
  visionLlmAvailable: boolean;
  pageImagesAvailable: boolean;
}): InvoiceProductionExtractionPlan {
  const nativeChars = params.canonicalDocument.pages.reduce((n, page) => n + (page.nativeCharCount ?? 0), 0);
  const nativeWords = params.canonicalDocument.pages.reduce((n, page) => n + (page.nativeWordCount ?? 0), 0);
  const ocrText = params.canonicalDocument.pages.map((page) => page.ocrText ?? "").join("\n");
  const ocrWords = params.canonicalDocument.pages.reduce((n, page) => n + (page.ocrWordCount ?? 0), 0);
  const nativeTextQuality = quality(nativeChars, nativeWords);
  const ocrQuality = quality(ocrText.length, ocrWords);
  const route = chooseInvoiceExtractionRoute({
    llmEnabled: params.llmEnabled,
    visionLlmAvailable: params.visionLlmAvailable,
    pageImagesAvailable: params.pageImagesAvailable,
    nativeTextQuality,
    ocrQuality
  });

  return {
    route,
    nativeTextQuality,
    ocrQuality,
    pageImagesAvailable: params.pageImagesAvailable,
    runDeterministic: nativeTextQuality !== InvoiceEvidenceQuality.UNAVAILABLE || ocrQuality !== InvoiceEvidenceQuality.UNAVAILABLE,
    runVision: params.llmEnabled && params.visionLlmAvailable && params.pageImagesAvailable,
    // Production vision is page-checkpointed. This avoids the context/output
    // failures established by Product E2E 1.3.9 while preserving page provenance.
    visionPageNumbers: params.canonicalDocument.pages.map((page) => page.pageNumber)
  };
}

function stableId(segmentId: string, field: string, pageNumber: number, index: number): string {
  const digest = createHash("sha256").update(`${segmentId}|${field}|${pageNumber}|${index}`).digest("hex").slice(0, 16);
  return `${segmentId}:vision:${digest}`;
}

/** Convert one page-checkpointed Vision response into ordinary F6 candidates.
 * Vision is a peer evidence source only: it cannot write normalizedData.
 */
export function projectVisionResponseToFieldCandidates(params: {
  response: InvoiceLlmExtractionResponse;
  segmentId: string;
  pageNumber: number;
  goodsLineOffset?: number;
}): FieldCandidateEnvelope {
  const fields: Record<string, FieldCandidate[]> = {};

  for (const extracted of params.response.fields) {
    const values = extracted.field.startsWith(GOODS_PREFIX)
      ? (Array.isArray(extracted.value) ? extracted.value : [])
      : [extracted.value];
    const leaf = extracted.field.startsWith(GOODS_PREFIX) ? extracted.field.slice(GOODS_PREFIX.length) : extracted.field;

    values.forEach((value, index) => {
      const canonicalValue = canonicalVisionValue(extracted.field, value);
      if (canonicalValue === null || canonicalValue === undefined || canonicalValue === "") return;
      const field = extracted.field.startsWith(GOODS_PREFIX)
        ? `goodsLines.${(params.goodsLineOffset ?? 0) + index}.${leaf}`
        : declarationFieldName(extracted.field);
      const evidence = extracted.evidence.find((item) => item.source === "PAGE_IMAGE" && item.pageNumber === params.pageNumber);
      if (!evidence) throw new Error(`Vision candidate PAGE_IMAGE evidence missing for ${field} on page ${params.pageNumber}.`);
      const candidate: FieldCandidate = {
        candidateId: stableId(params.segmentId, field, params.pageNumber, index),
        field,
        value: canonicalValue,
        confidence: extracted.confidence,
        extractor: VISION_EXTRACTOR,
        evidence: [{
          segmentId: params.segmentId,
          pageNumber: params.pageNumber,
          ...(evidence.region ? { bbox: {
            x0: evidence.region.x,
            y0: evidence.region.y,
            x1: evidence.region.x + evidence.region.width,
            y1: evidence.region.y + evidence.region.height
          } } : {}),
          ...(evidence.quote ? { text: evidence.quote } : {}),
          contentSource: "PAGE_IMAGE"
        }]
      };
      (fields[field] ??= []).push(candidate);
    });
  }

  // A VLM can occasionally merge a visually adjacent invoice date into the
  // invoice-number value while leaving invoiceDate null. Recover that date only
  // from the same explicitly separated date-shaped suffix. Explicit invoiceDate
  // evidence always wins; ambiguous numeric dates remain unresolved/fail-closed.
  if (!(fields.invoiceDate?.length)) {
    const invoiceNumberField = params.response.fields.find((item) => item.field === "invoiceNumber" && typeof item.value === "string");
    if (invoiceNumberField && typeof invoiceNumberField.value === "string") {
      const { dateToken } = splitInvoiceNumberDateSuffix(invoiceNumberField.value);
      const derivedDate = canonicalInvoiceDateSuffix(dateToken);
      const evidence = invoiceNumberField.evidence.find((item) => item.source === "PAGE_IMAGE" && item.pageNumber === params.pageNumber);
      if (derivedDate && evidence) {
        const field = "invoiceDate";
        fields[field] = [{
          candidateId: stableId(params.segmentId, field, params.pageNumber, 0),
          field,
          value: derivedDate,
          confidence: invoiceNumberField.confidence,
          extractor: VISION_EXTRACTOR,
          evidence: [{
            segmentId: params.segmentId,
            pageNumber: params.pageNumber,
            ...(evidence.region ? { bbox: {
              x0: evidence.region.x,
              y0: evidence.region.y,
              x1: evidence.region.x + evidence.region.width,
              y1: evidence.region.y + evidence.region.height
            } } : {}),
            ...(evidence.quote ? { text: evidence.quote } : {}),
            contentSource: "PAGE_IMAGE"
          }]
        }];
      }
    }
  }

  return { version: "1", fields };
}


/**
 * 1.6.7 LLM-first cutover merge. A semantic VLM candidate is authoritative at
 * the candidate-source boundary for fields it actually extracted. Native/OCR/
 * deterministic candidates remain a degraded fallback only for fields the VLM
 * did not extract. Selection/validation still happens in the existing F6
 * resolver; this function never writes normalizedData.
 */
export function mergeInvoicePrimaryWithFallback(
  primary: FieldCandidateEnvelope,
  ...fallbacks: FieldCandidateEnvelope[]
): FieldCandidateEnvelope {
  const fallback = mergeInvoiceCandidateSources(...fallbacks);
  const fields: Record<string, FieldCandidate[]> = {};
  const allFields = new Set([...Object.keys(fallback.fields), ...Object.keys(primary.fields)]);
  for (const field of allFields) {
    const primaryCandidates = primary.fields[field] ?? [];
    fields[field] = primaryCandidates.length > 0 ? [...primaryCandidates] : [...(fallback.fields[field] ?? [])];
  }
  return { version: "1", fields };
}

/** Candidate fusion never selects a winner. It only preserves peer candidates
 * for the existing F6 resolver/authority path.
 */
export function mergeInvoiceCandidateSources(...sources: FieldCandidateEnvelope[]): FieldCandidateEnvelope {
  const fields: Record<string, FieldCandidate[]> = {};
  const ids = new Set<string>();
  for (const source of sources) {
    for (const [field, candidates] of Object.entries(source.fields)) {
      for (const candidate of candidates) {
        if (candidate.field !== field) throw new Error(`Candidate field mismatch: ${candidate.candidateId}`);
        if (ids.has(candidate.candidateId)) throw new Error(`Duplicate fused candidate id: ${candidate.candidateId}`);
        ids.add(candidate.candidateId);
        (fields[field] ??= []).push(candidate);
      }
    }
  }
  return { version: "1", fields };
}
