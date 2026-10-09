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
  buyer: "parties.buyer.name",
  origin: "originCountry",
  grossKg: "grossWeight",
  netKg: "netWeight"
};

function declarationFieldName(visionField: string): string {
  return VISION_TO_DECLARATION_FIELD[visionField] ?? visionField;
}

const NUMERIC_INVOICE_FIELDS = new Set([
  "grossKg",
  "netKg",
  "goodsLines[].quantity",
  "goodsLines[].unitPrice",
  "goodsLines[].lineTotal"
]);

/**
 * Vision models commonly serialize invoice numbers as strings (for example
 * "2", "10.00 USD", or "1.602,00 EUR"). F6 candidates must use the same
 * canonical numeric representation as deterministic extraction before
 * resolution; otherwise a valid LLM selection can later fail deterministic
 * invoice validation purely because of JSON representation.
 *
 * This parser is intentionally conservative: it accepts only a numeric token
 * with optional grouping/decimal separators and optional alphabetic currency/
 * unit suffix. Unrecognized text remains unchanged and therefore fails closed
 * in the existing validator/review path.
 */
export function canonicalVisionValue(field: string, value: unknown): unknown {
  if (!NUMERIC_INVOICE_FIELDS.has(field) || typeof value !== "string") return value;
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
      if (value === null || value === undefined || value === "") return;
      const field = extracted.field.startsWith(GOODS_PREFIX)
        ? `goodsLines.${(params.goodsLineOffset ?? 0) + index}.${leaf}`
        : declarationFieldName(extracted.field);
      const evidence = extracted.evidence.find((item) => item.source === "PAGE_IMAGE" && item.pageNumber === params.pageNumber);
      if (!evidence) throw new Error(`Vision candidate PAGE_IMAGE evidence missing for ${field} on page ${params.pageNumber}.`);
      const candidate: FieldCandidate = {
        candidateId: stableId(params.segmentId, field, params.pageNumber, index),
        field,
        value: canonicalVisionValue(extracted.field, value),
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
