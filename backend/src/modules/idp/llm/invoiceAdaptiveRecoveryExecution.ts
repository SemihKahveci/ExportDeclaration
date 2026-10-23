import type { CanonicalDocument } from "../domain/canonicalDocument.types.js";
import type { FieldCandidate, FieldCandidateEnvelope } from "../domain/fieldCandidate.types.js";
import {
  InvoiceLlmEvidenceMode,
  type InvoiceLlmExtractionArtifact,
  type InvoiceLlmExtractionProvider
} from "../domain/invoiceLlmExtraction.types.js";
import { mergeInvoiceCandidateSources, projectVisionResponseToFieldCandidates } from "./invoiceProductionExtractionOrchestrator.js";
import type { InvoiceVisionPageRenderer } from "./invoiceProductionVisionExecution.js";
import { InvoiceRecoveryTool, type InvoiceAdaptiveRecoveryPlan } from "./invoiceAdaptiveRecoveryOrchestrator.js";
import { NATIVE_CELL_EXTRACTOR } from "../candidates/invoiceNativeCellBinding.js";

const DECLARATION_TO_VISION: Readonly<Record<string, string>> = {
  invoiceNo: "invoiceNumber",
  invoiceDate: "invoiceDate",
  currency: "currency"
};


function parseRawModelResponse(value: unknown): any | null {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try { return JSON.parse(value); } catch { return null; }
}

function compactEvidence(value: unknown): string {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function currencyEvidenceSupports(value: unknown, rawEvidence: unknown): boolean {
  const currency = compactEvidence(value);
  const evidence = compactEvidence(rawEvidence);
  if (!currency || !evidence) return false;
  const aliases: Readonly<Record<string, readonly string[]>> = {
    EUR: ["EUR", "EURO"],
    EURO: ["EUR", "EURO"],
    USD: ["USD"],
    GBP: ["GBP"],
    TRY: ["TRY", "TL", "TRL"],
    CNY: ["CNY", "RMB"],
    RMB: ["CNY", "RMB"]
  };
  return (aliases[currency] ?? [currency]).some((token) => evidence.includes(token));
}

function exactScalarEvidenceSupports(value: unknown, rawEvidence: unknown): boolean {
  const scalar = compactEvidence(value);
  const evidence = compactEvidence(rawEvidence);
  return Boolean(scalar && evidence && (scalar === evidence || evidence.includes(scalar)));
}

/**
 * The normal provider semantic gate intentionally remains strict. A focused
 * adaptive recovery call, however, already has a planner-selected field and
 * can retain a scalar when the same raw model response also carries explicit
 * criticalScalarEvidence for that field. This adapter is deliberately local to
 * the bounded executor: it never changes the primary provider gate and it does
 * not accept unsupported raw values.
 */
function adaptFocusedScalarResponseFromRawEvidence(params: {
  response: any;
  requestedVisionFields: string[];
  pageNumber: number;
}): { response: any; adaptedVisionFields: string[] } {
  const artifact = params.response?.extractionArtifact;
  const raw = parseRawModelResponse(artifact?.rawModelResponse);
  if (!raw || typeof raw !== "object") return { response: params.response, adaptedVisionFields: [] };

  const existing = Array.isArray(params.response?.fields) ? params.response.fields : [];
  const existingNames = new Set(existing.map((field: any) => String(field?.field ?? "")));
  const additions: any[] = [];

  for (const field of params.requestedVisionFields) {
    if (existingNames.has(field)) continue;
    if (field !== "invoiceDate" && field !== "currency") continue;
    const value = raw[field];
    const evidence = raw?.criticalScalarEvidence?.[field];
    const rawEvidence = evidence?.rawValue;
    const supported = field === "currency"
      ? currencyEvidenceSupports(value, rawEvidence)
      : exactScalarEvidenceSupports(value, rawEvidence);
    if (!supported) continue;
    additions.push({
      field,
      value,
      confidence: 0.99,
      evidence: [{ pageNumber: params.pageNumber, source: "PAGE_IMAGE" }]
    });
  }

  if (additions.length === 0) return { response: params.response, adaptedVisionFields: [] };
  return {
    response: { ...params.response, decision: "PARTIAL", fields: [...existing, ...additions] },
    adaptedVisionFields: additions.map((field) => field.field)
  };
}

export interface InvoiceAdaptiveRecoveryExecutionAudit {
  version: "1";
  mode: "BOUNDED_EXECUTION";
  requestedFields: string[];
  attemptedPages: number[];
  recoveredFields: string[];
  rawEvidenceAdaptedFields: string[];
  currencyContextRetryPages: number[];
  replacedPrimaryFields: string[];
  failedPages: Array<{ pageNumber: number; error: string }>;
  foundation6Authoritative: true;
  writesNormalizedData: false;
}

/**
 * Execute only the first deliberately narrow Foundation-7 recovery slice:
 * scalar evidence for invoice identity/date/currency. Planner actions for
 * goods/layout/cross-page evidence remain shadow-only until their own bounded
 * executors are proven. A successful focused Qwen pass replaces only the
 * corresponding field from the earlier semantic-primary pass; every other
 * candidate is preserved and Foundation 6 remains the sole resolver/promoter.
 */
export async function executeInvoiceAdaptiveScalarRecovery(params: {
  canonicalDocument: CanonicalDocument;
  segmentId: string;
  pageNumbers: number[];
  plan: InvoiceAdaptiveRecoveryPlan;
  currentCandidates: FieldCandidateEnvelope;
  provider: InvoiceLlmExtractionProvider;
  renderPage: InvoiceVisionPageRenderer;
  persistModelExtractionArtifact?: (artifact: InvoiceLlmExtractionArtifact) => Promise<void>;
}): Promise<{ candidates: FieldCandidateEnvelope; audit: InvoiceAdaptiveRecoveryExecutionAudit }> {
  const requestedDeclarationFields = [...new Set(
    params.plan.actions
      .filter((action) => action.tool === InvoiceRecoveryTool.SCALAR_EVIDENCE)
      .flatMap((action) => action.fields)
      .filter((field) => Boolean(DECLARATION_TO_VISION[field]))
  )].sort();

  const audit: InvoiceAdaptiveRecoveryExecutionAudit = {
    version: "1",
    mode: "BOUNDED_EXECUTION",
    requestedFields: requestedDeclarationFields,
    attemptedPages: [],
    recoveredFields: [],
    rawEvidenceAdaptedFields: [],
    currencyContextRetryPages: [],
    replacedPrimaryFields: [],
    failedPages: [],
    foundation6Authoritative: true,
    writesNormalizedData: false
  };
  if (requestedDeclarationFields.length === 0) return { candidates: params.currentCandidates, audit };

  const requestedVisionFields = requestedDeclarationFields.map((field) => DECLARATION_TO_VISION[field]!);
  const recoveredSources: FieldCandidateEnvelope[] = [];
  const remaining = new Set(requestedDeclarationFields);

  // SCALAR_EVIDENCE is intentionally header-local. Cap execution to the first
  // two segment pages so a planner anomaly cannot fan out across a long invoice.
  for (const pageNumber of [...params.pageNumbers].sort((a, b) => a - b).slice(0, 2)) {
    if (remaining.size === 0) break;
    const page = params.canonicalDocument.pages.find((item) => item.pageNumber === pageNumber);
    if (!page) continue;
    audit.attemptedPages.push(pageNumber);
    try {
      const image = await params.renderPage(pageNumber);
      const response = await params.provider.extractInvoice({
        version: "1",
        documentId: `${params.segmentId}:adaptive-scalar:${pageNumber}`,
        evidenceMode: InvoiceLlmEvidenceMode.PAGE_IMAGE,
        requestedFields: requestedVisionFields,
        nativeText: page.nativeText ?? "",
        ocrText: page.ocrText ?? "",
        verifiedKnowledge: [],
        focusInstruction: [
          "Focused recovery for invoice header scalars only.",
          "Return a field only when the visible page evidence supports its exact semantic role.",
          "invoiceNumber must contain only the invoice identifier; exclude adjacent dates, labels and payment terms.",
          "invoiceDate must be the invoice issue/date field, not due date, delivery date or a date embedded beside the invoice number.",
          "currency must be the transaction currency visibly supported by currency code/symbol or monetary column context.",
          "Do not infer missing values from arithmetic, supplier identity or general knowledge. If uncertain, omit the field."
        ].join(" ")
      }, [image]);
      if (response.extractionArtifact) await params.persistModelExtractionArtifact?.(response.extractionArtifact);
      const adapted = adaptFocusedScalarResponseFromRawEvidence({ response, requestedVisionFields, pageNumber });
      for (const visionField of adapted.adaptedVisionFields) {
        const declarationField = Object.entries(DECLARATION_TO_VISION).find(([, mapped]) => mapped === visionField)?.[0];
        if (declarationField && !audit.rawEvidenceAdaptedFields.includes(declarationField)) {
          audit.rawEvidenceAdaptedFields.push(declarationField);
        }
      }
      const projected = projectVisionResponseToFieldCandidates({ response: adapted.response, segmentId: params.segmentId, pageNumber });
      const filtered: FieldCandidateEnvelope = { version: "1", fields: {} };
      for (const field of [...remaining]) {
        const candidates = projected.fields[field] ?? [];
        if (candidates.length === 0) continue;
        filtered.fields[field] = candidates.map((candidate) => ({
          ...candidate,
          candidateId: `${candidate.candidateId}:adaptive-scalar`
        }));
        remaining.delete(field);
      }
      if (Object.keys(filtered.fields).length > 0) recoveredSources.push(filtered);
    } catch (error) {
      audit.failedPages.push({ pageNumber, error: error instanceof Error ? error.message : String(error) });
    }
  }

  // A currency can be visually explicit in a monetary table even when the
  // generic header-scalar pass returns no raw value at all (for example, a
  // currency code printed beside a unit price). Retry once, only for an
  // unresolved planner-requested currency, with a monetary-context focus.
  // This remains evidence-bound: the local raw-evidence adapter still requires
  // the returned currency token to be present in criticalScalarEvidence.
  if (remaining.has("currency")) {
    const pageNumber = [...params.pageNumbers].sort((a, b) => a - b)[0];
    const page = pageNumber === undefined
      ? undefined
      : params.canonicalDocument.pages.find((item) => item.pageNumber === pageNumber);
    if (page && pageNumber !== undefined) {
      audit.currencyContextRetryPages.push(pageNumber);
      try {
        const image = await params.renderPage(pageNumber);
        const response = await params.provider.extractInvoice({
          version: "1",
          documentId: `${params.segmentId}:adaptive-scalar-currency-context:${pageNumber}`,
          evidenceMode: InvoiceLlmEvidenceMode.PAGE_IMAGE,
          requestedFields: ["currency"],
          nativeText: page.nativeText ?? "",
          ocrText: page.ocrText ?? "",
          verifiedKnowledge: [],
          focusInstruction: [
            "Focused recovery for transaction currency only.",
            "Inspect visible monetary table headers and monetary cells as well as invoice header fields.",
            "A currency code or symbol printed beside a unit price or amount is valid evidence for transaction currency.",
            "Return currency only when the same visible page supplies the currency token in criticalScalarEvidence.currency.rawValue.",
            "Do not infer currency from supplier identity, country, language, arithmetic or general knowledge. If no visible currency token exists, omit it."
          ].join(" ")
        }, [image]);
        if (response.extractionArtifact) await params.persistModelExtractionArtifact?.(response.extractionArtifact);
        const adapted = adaptFocusedScalarResponseFromRawEvidence({
          response,
          requestedVisionFields: ["currency"],
          pageNumber
        });
        if (adapted.adaptedVisionFields.includes("currency") && !audit.rawEvidenceAdaptedFields.includes("currency")) {
          audit.rawEvidenceAdaptedFields.push("currency");
        }
        const projected = projectVisionResponseToFieldCandidates({
          response: adapted.response,
          segmentId: params.segmentId,
          pageNumber
        });
        const candidates = projected.fields.currency ?? [];
        if (candidates.length > 0) {
          recoveredSources.push({
            version: "1",
            fields: {
              currency: candidates.map((candidate) => ({
                ...candidate,
                candidateId: `${candidate.candidateId}:adaptive-scalar-currency-context`
              }))
            }
          });
          remaining.delete("currency");
        }
      } catch (error) {
        audit.failedPages.push({
          pageNumber,
          error: `currency-context: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }
  }

  const recovered = mergeInvoiceCandidateSources(...recoveredSources);
  audit.rawEvidenceAdaptedFields.sort();
  audit.recoveredFields = Object.keys(recovered.fields).sort();
  if (audit.recoveredFields.length === 0) return { candidates: params.currentCandidates, audit };

  const fields = { ...params.currentCandidates.fields };
  for (const field of audit.recoveredFields) {
    fields[field] = recovered.fields[field]!;
    audit.replacedPrimaryFields.push(field);
  }
  audit.replacedPrimaryFields.sort();
  return { candidates: { version: "1", fields }, audit };
}


export interface InvoiceAdaptiveGoodsDescriptionRecoveryAudit {
  version: "1";
  mode: "BOUNDED_GOODS_DESCRIPTION_EXECUTION";
  requestedFields: string[];
  attemptedPages: number[];
  recoveredFields: string[];
  matchedByNumericFingerprint: string[];
  replacedPrimaryFields: string[];
  failedPages: Array<{ pageNumber: number; error: string }>;
  foundation6Authoritative: true;
  writesNormalizedData: false;
}

function numericFingerprintValue(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const normalized = value.trim().replace(/\s+/g, "").replace(/,/g, ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function candidateNumericValue(candidates: FieldCandidate[] | undefined): number | undefined {
  for (const candidate of candidates ?? []) {
    const value = numericFingerprintValue(candidate.value);
    if (value !== undefined) return value;
  }
  return undefined;
}

function sameNumericValue(left: number | undefined, right: unknown): boolean {
  if (left === undefined) return false;
  const parsed = numericFingerprintValue(right);
  if (parsed === undefined) return false;
  return Math.abs(left - parsed) <= Math.max(0.000001, Math.abs(left) * 0.000001);
}

/**
 * Execute only planner-requested missing goods descriptions. The raw Qwen row
 * is accepted only when at least two numeric cells (quantity/unitPrice/
 * lineTotal) uniquely match the already-existing target row. This keeps row
 * identity evidence-bound without trusting array position, supplier identity,
 * or ground truth. Other GOODS_TABLE_EVIDENCE actions remain shadow-only.
 */
export async function executeInvoiceAdaptiveGoodsDescriptionRecovery(params: {
  canonicalDocument: CanonicalDocument;
  segmentId: string;
  pageNumbers: number[];
  plan: InvoiceAdaptiveRecoveryPlan;
  currentCandidates: FieldCandidateEnvelope;
  provider: InvoiceLlmExtractionProvider;
  renderPage: InvoiceVisionPageRenderer;
  persistModelExtractionArtifact?: (artifact: InvoiceLlmExtractionArtifact) => Promise<void>;
}): Promise<{ candidates: FieldCandidateEnvelope; audit: InvoiceAdaptiveGoodsDescriptionRecoveryAudit }> {
  const requestedFields = [...new Set(
    params.plan.actions
      .filter((action) => action.tool === InvoiceRecoveryTool.GOODS_TABLE_EVIDENCE && action.reason === "MISSING_GOODS_FIELD")
      .flatMap((action) => action.fields)
      .filter((field) => /^goodsLines\.\d+\.description$/.test(field))
  )].sort();

  const audit: InvoiceAdaptiveGoodsDescriptionRecoveryAudit = {
    version: "1",
    mode: "BOUNDED_GOODS_DESCRIPTION_EXECUTION",
    requestedFields,
    attemptedPages: [],
    recoveredFields: [],
    matchedByNumericFingerprint: [],
    replacedPrimaryFields: [],
    failedPages: [],
    foundation6Authoritative: true,
    writesNormalizedData: false
  };
  if (requestedFields.length === 0) return { candidates: params.currentCandidates, audit };

  const remaining = new Set(requestedFields);
  const recovered: Record<string, FieldCandidate[]> = {};

  // Missing-description recovery is page-image bounded just like scalar
  // recovery. Two pages are enough to prevent accidental fan-out on long docs.
  for (const pageNumber of [...params.pageNumbers].sort((a, b) => a - b).slice(0, 2)) {
    if (remaining.size === 0) break;
    const page = params.canonicalDocument.pages.find((item) => item.pageNumber === pageNumber);
    if (!page) continue;
    audit.attemptedPages.push(pageNumber);
    try {
      const image = await params.renderPage(pageNumber);
      const response = await params.provider.extractInvoice({
        version: "1",
        documentId: `${params.segmentId}:adaptive-goods-description:${pageNumber}`,
        evidenceMode: InvoiceLlmEvidenceMode.PAGE_IMAGE,
        requestedFields: ["goodsLines[].description"],
        nativeText: page.nativeText ?? "",
        ocrText: page.ocrText ?? "",
        verifiedKnowledge: [],
        focusInstruction: [
          "Focused recovery for missing goods-row descriptions only.",
          "Read the visible goods table on this page and preserve row order.",
          "Return descriptions only when visibly supported by the row.",
          "Also retain visible quantity, unit price and line total in the raw goods rows so row identity can be verified.",
          "Do not infer descriptions from supplier identity, product families, arithmetic or general knowledge. If uncertain, omit the description."
        ].join(" ")
      }, [image]);
      if (response.extractionArtifact) await params.persistModelExtractionArtifact?.(response.extractionArtifact);
      const raw = parseRawModelResponse(response.extractionArtifact?.rawModelResponse);
      const rawRows = Array.isArray(raw?.goodsLines) ? raw.goodsLines : [];

      for (const field of [...remaining]) {
        const match = field.match(/^goodsLines\.(\d+)\.description$/);
        if (!match) continue;
        const index = Number(match[1]);
        const target = {
          quantity: candidateNumericValue(params.currentCandidates.fields[`goodsLines.${index}.quantity`]),
          unitPrice: candidateNumericValue(params.currentCandidates.fields[`goodsLines.${index}.unitPrice`]),
          lineTotal: candidateNumericValue(params.currentCandidates.fields[`goodsLines.${index}.lineTotal`])
        };
        const anchorCount = Object.values(target).filter((value) => value !== undefined).length;
        if (anchorCount < 2) continue;

        const matches = rawRows.filter((row: any) => {
          const score = Number(sameNumericValue(target.quantity, row?.quantity))
            + Number(sameNumericValue(target.unitPrice, row?.unitPrice))
            + Number(sameNumericValue(target.lineTotal, row?.lineTotal));
          return score >= 2;
        });
        if (matches.length !== 1) continue;
        const description = String(matches[0]?.description ?? "").trim();
        if (!description) continue;

        recovered[field] = [{
          candidateId: `${params.segmentId}:adaptive-goods-description:${index}:${pageNumber}`,
          field,
          value: description,
          confidence: 0.99,
          extractor: "invoice-qwen-vision-adaptive-goods-description-v1",
          evidence: [{ segmentId: params.segmentId, pageNumber, contentSource: "PAGE_IMAGE" }]
        }];
        remaining.delete(field);
        audit.matchedByNumericFingerprint.push(field);
      }
    } catch (error) {
      audit.failedPages.push({ pageNumber, error: error instanceof Error ? error.message : String(error) });
    }
  }

  audit.recoveredFields = Object.keys(recovered).sort();
  audit.matchedByNumericFingerprint.sort();
  if (audit.recoveredFields.length === 0) return { candidates: params.currentCandidates, audit };

  const fields = { ...params.currentCandidates.fields };
  for (const field of audit.recoveredFields) {
    fields[field] = recovered[field]!;
    audit.replacedPrimaryFields.push(field);
  }
  audit.replacedPrimaryFields.sort();
  return { candidates: { version: "1", fields }, audit };
}


export interface InvoiceAdaptiveGoodsCodeRecoveryAudit {
  version: "1";
  mode: "BOUNDED_GOODS_CODE_EXECUTION";
  requestedFields: string[];
  attemptedPages: number[];
  recoveredFields: string[];
  exactTwelveDigitEvidenceFields: string[];
  matchedByNumericFingerprint: string[];
  replacedPrimaryFields: string[];
  failedPages: Array<{ pageNumber: number; error: string }>;
  foundation6Authoritative: true;
  writesNormalizedData: false;
}

function exactTwelveDigitHsCode(value: unknown): string | undefined {
  const digits = String(value ?? "").replace(/\D/g, "");
  return /^\d{12}$/.test(digits) ? digits : undefined;
}

/**
 * Execute only planner-requested invalid/missing GTIP recovery. A code is
 * accepted only when the focused PAGE_IMAGE response contains exactly twelve
 * digits and its raw goods row is uniquely bound to the existing declaration
 * row by at least two numeric anchors. Short/long codes stay REVIEW_REQUIRED;
 * no padding, guessing, tariff lookup or supplier knowledge is allowed.
 */
export async function executeInvoiceAdaptiveGoodsCodeRecovery(params: {
  canonicalDocument: CanonicalDocument;
  segmentId: string;
  pageNumbers: number[];
  plan: InvoiceAdaptiveRecoveryPlan;
  currentCandidates: FieldCandidateEnvelope;
  provider: InvoiceLlmExtractionProvider;
  renderPage: InvoiceVisionPageRenderer;
  persistModelExtractionArtifact?: (artifact: InvoiceLlmExtractionArtifact) => Promise<void>;
}): Promise<{ candidates: FieldCandidateEnvelope; audit: InvoiceAdaptiveGoodsCodeRecoveryAudit }> {
  const requestedFields = [...new Set(
    params.plan.actions
      .filter((action) => action.tool === InvoiceRecoveryTool.GOODS_TABLE_EVIDENCE && action.reason === "INVALID_GTIN_SHAPE")
      .flatMap((action) => action.fields)
      .filter((field) => /^goodsLines\.\d+\.hsCode$/.test(field))
  )].sort();

  const audit: InvoiceAdaptiveGoodsCodeRecoveryAudit = {
    version: "1",
    mode: "BOUNDED_GOODS_CODE_EXECUTION",
    requestedFields,
    attemptedPages: [],
    recoveredFields: [],
    exactTwelveDigitEvidenceFields: [],
    matchedByNumericFingerprint: [],
    replacedPrimaryFields: [],
    failedPages: [],
    foundation6Authoritative: true,
    writesNormalizedData: false
  };
  if (requestedFields.length === 0) return { candidates: params.currentCandidates, audit };

  const remaining = new Set(requestedFields);
  const recovered: Record<string, FieldCandidate[]> = {};

  for (const pageNumber of [...params.pageNumbers].sort((a, b) => a - b).slice(0, 2)) {
    if (remaining.size === 0) break;
    const page = params.canonicalDocument.pages.find((item) => item.pageNumber === pageNumber);
    if (!page) continue;
    audit.attemptedPages.push(pageNumber);
    try {
      const image = await params.renderPage(pageNumber);
      const response = await params.provider.extractInvoice({
        version: "1",
        documentId: `${params.segmentId}:adaptive-goods-code:${pageNumber}`,
        evidenceMode: InvoiceLlmEvidenceMode.PAGE_IMAGE,
        requestedFields: ["goodsLines[].hsCode"],
        nativeText: page.nativeText ?? "",
        ocrText: page.ocrText ?? "",
        verifiedKnowledge: [],
        focusInstruction: [
          "Focused recovery for visible goods-row customs/GTIP/HS codes only.",
          "Read the visible goods table and preserve row order.",
          "Return the code exactly as printed; never pad, truncate, complete or infer digits.",
          "Also retain visible quantity, unit price and line total in raw goods rows so row identity can be verified.",
          "If a full twelve-digit code is not visibly supported, omit the code."
        ].join(" ")
      }, [image]);
      if (response.extractionArtifact) await params.persistModelExtractionArtifact?.(response.extractionArtifact);
      const raw = parseRawModelResponse(response.extractionArtifact?.rawModelResponse);
      const rawRows = Array.isArray(raw?.goodsLines) ? raw.goodsLines : [];

      for (const field of [...remaining]) {
        const match = field.match(/^goodsLines\.(\d+)\.hsCode$/);
        if (!match) continue;
        const index = Number(match[1]);
        const target = {
          quantity: candidateNumericValue(params.currentCandidates.fields[`goodsLines.${index}.quantity`]),
          unitPrice: candidateNumericValue(params.currentCandidates.fields[`goodsLines.${index}.unitPrice`]),
          lineTotal: candidateNumericValue(params.currentCandidates.fields[`goodsLines.${index}.lineTotal`])
        };
        const anchorCount = Object.values(target).filter((value) => value !== undefined).length;
        if (anchorCount < 2) continue;

        const matches = rawRows.filter((row: any) => {
          const score = Number(sameNumericValue(target.quantity, row?.quantity))
            + Number(sameNumericValue(target.unitPrice, row?.unitPrice))
            + Number(sameNumericValue(target.lineTotal, row?.lineTotal));
          return score >= 2;
        });
        if (matches.length !== 1) continue;
        const hsCode = exactTwelveDigitHsCode(matches[0]?.hsCode);
        if (!hsCode) continue;

        recovered[field] = [{
          candidateId: `${params.segmentId}:adaptive-goods-code:${index}:${pageNumber}`,
          field,
          value: hsCode,
          confidence: 0.99,
          extractor: "invoice-qwen-vision-adaptive-goods-code-v1",
          evidence: [{ segmentId: params.segmentId, pageNumber, contentSource: "PAGE_IMAGE" }]
        }];
        remaining.delete(field);
        audit.exactTwelveDigitEvidenceFields.push(field);
        audit.matchedByNumericFingerprint.push(field);
      }
    } catch (error) {
      audit.failedPages.push({ pageNumber, error: error instanceof Error ? error.message : String(error) });
    }
  }

  audit.recoveredFields = Object.keys(recovered).sort();
  audit.exactTwelveDigitEvidenceFields.sort();
  audit.matchedByNumericFingerprint.sort();
  if (audit.recoveredFields.length === 0) return { candidates: params.currentCandidates, audit };

  const fields = { ...params.currentCandidates.fields };
  for (const field of audit.recoveredFields) {
    fields[field] = recovered[field]!;
    audit.replacedPrimaryFields.push(field);
  }
  audit.replacedPrimaryFields.sort();
  return { candidates: { version: "1", fields }, audit };
}


export interface InvoiceAdaptiveGoodsNumericRecoveryAudit {
  version: "1";
  mode: "BOUNDED_GOODS_NUMERIC_EXECUTION";
  requestedFields: string[];
  attemptedPages: number[];
  recoveredFields: string[];
  arithmeticCorroboratedFields: string[];
  matchedByNumericFingerprint: string[];
  replacedPrimaryFields: string[];
  failedPages: Array<{ pageNumber: number; error: string }>;
  foundation6Authoritative: true;
  writesNormalizedData: false;
}

function normalizeGoodsRowIdentityText(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const normalized = value
    .normalize("NFKC")
    .toLocaleUpperCase("en-US")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return normalized || undefined;
}

function arithmeticSupportsLineTotal(row: any): boolean {
  const quantity = numericFingerprintValue(row?.quantity);
  const unitPrice = numericFingerprintValue(row?.unitPrice);
  const lineTotal = numericFingerprintValue(row?.lineTotal);
  if (quantity === undefined || unitPrice === undefined || lineTotal === undefined) return false;
  const expected = quantity * unitPrice;
  return Math.abs(expected - lineTotal) <= Math.max(0.01, Math.abs(expected) * 0.000001);
}

function soleCandidateNumber(candidates: FieldCandidateEnvelope, field: string): number | undefined {
  const list = candidates.fields[field] ?? [];
  if (list.length !== 1) return undefined;
  const value = list[0]?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** A native cell or an already consistent qty × price needs no second vision read. */
export function goodsLineTotalRecoveryBlocked(candidates: FieldCandidateEnvelope, field: string): boolean {
  const match = /^goodsLines\.(\d+)\.lineTotal$/.exec(field);
  if (!match) return false;
  if ((candidates.fields[field] ?? []).some((candidate) => candidate.extractor === NATIVE_CELL_EXTRACTOR)) return true;
  const quantity = soleCandidateNumber(candidates, `goodsLines.${match[1]}.quantity`);
  const unitPrice = soleCandidateNumber(candidates, `goodsLines.${match[1]}.unitPrice`);
  const lineTotal = soleCandidateNumber(candidates, field);
  if (quantity == null || unitPrice == null || lineTotal == null || !(quantity > 0) || !(unitPrice > 0)) return false;
  const expected = quantity * unitPrice;
  return Math.abs(expected - lineTotal) <= Math.max(0.01, Math.abs(expected) * 1e-6);
}

/**
 * Execute only planner-requested arithmetic disagreements for goods lineTotal.
 * Recovery is deliberately narrower than the planner action: quantity and
 * unitPrice remain untouched. A PAGE_IMAGE row must uniquely match the current
 * declaration row by quantity + unitPrice and its visible/model-parsed
 * lineTotal must corroborate quantity * unitPrice. This avoids locale/grouping
 * corruption downstream without trusting array position or supplier identity.
 */
export async function executeInvoiceAdaptiveGoodsNumericRecovery(params: {
  canonicalDocument: CanonicalDocument;
  segmentId: string;
  pageNumbers: number[];
  plan: InvoiceAdaptiveRecoveryPlan;
  currentCandidates: FieldCandidateEnvelope;
  provider: InvoiceLlmExtractionProvider;
  renderPage: InvoiceVisionPageRenderer;
  persistModelExtractionArtifact?: (artifact: InvoiceLlmExtractionArtifact) => Promise<void>;
}): Promise<{ candidates: FieldCandidateEnvelope; audit: InvoiceAdaptiveGoodsNumericRecoveryAudit }> {
  const requestedFields = [...new Set(
    params.plan.actions
      .filter((action) => action.tool === InvoiceRecoveryTool.GOODS_TABLE_EVIDENCE && action.reason === "GOODS_ARITHMETIC_DISAGREEMENT")
      .flatMap((action) => action.fields)
      .filter((field) => /^goodsLines\.\d+\.lineTotal$/.test(field))
      .filter((field) => !goodsLineTotalRecoveryBlocked(params.currentCandidates, field))
  )].sort();

  const audit: InvoiceAdaptiveGoodsNumericRecoveryAudit = {
    version: "1",
    mode: "BOUNDED_GOODS_NUMERIC_EXECUTION",
    requestedFields,
    attemptedPages: [],
    recoveredFields: [],
    arithmeticCorroboratedFields: [],
    matchedByNumericFingerprint: [],
    replacedPrimaryFields: [],
    failedPages: [],
    foundation6Authoritative: true,
    writesNormalizedData: false
  };
  if (requestedFields.length === 0) return { candidates: params.currentCandidates, audit };

  const remaining = new Set(requestedFields);
  const recovered: Record<string, FieldCandidate[]> = {};

  for (const pageNumber of [...params.pageNumbers].sort((a, b) => a - b).slice(0, 2)) {
    if (remaining.size === 0) break;
    const page = params.canonicalDocument.pages.find((item) => item.pageNumber === pageNumber);
    if (!page) continue;
    audit.attemptedPages.push(pageNumber);
    try {
      const image = await params.renderPage(pageNumber);
      const response = await params.provider.extractInvoice({
        version: "1",
        documentId: `${params.segmentId}:adaptive-goods-numeric:${pageNumber}`,
        evidenceMode: InvoiceLlmEvidenceMode.PAGE_IMAGE,
        requestedFields: ["goodsLines[].quantity", "goodsLines[].unitPrice", "goodsLines[].lineTotal"],
        nativeText: page.nativeText ?? "",
        ocrText: page.ocrText ?? "",
        verifiedKnowledge: [],
        focusInstruction: [
          "Focused recovery for visible goods-row numeric cells only.",
          "Read quantity, unit price and line total exactly from the visible table and preserve row order.",
          "Preserve thousands and decimal semantics exactly; do not truncate values at grouping separators.",
          "Do not infer missing cells, do not alter free-of-charge rows, and do not use supplier knowledge.",
          "If a numeric cell is not visibly supported, omit it."
        ].join(" ")
      }, [image]);
      if (response.extractionArtifact) await params.persistModelExtractionArtifact?.(response.extractionArtifact);
      const raw = parseRawModelResponse(response.extractionArtifact?.rawModelResponse);
      const rawRows = Array.isArray(raw?.goodsLines) ? raw.goodsLines : [];

      for (const field of [...remaining]) {
        const match = field.match(/^goodsLines\.(\d+)\.lineTotal$/);
        if (!match) continue;
        const index = Number(match[1]);
        const targetQuantity = candidateNumericValue(params.currentCandidates.fields[`goodsLines.${index}.quantity`]);
        const targetUnitPrice = candidateNumericValue(params.currentCandidates.fields[`goodsLines.${index}.unitPrice`]);
        if (targetQuantity === undefined || targetUnitPrice === undefined) continue;

        const numericMatches = rawRows.filter((row: any) =>
          sameNumericValue(targetQuantity, row?.quantity)
          && sameNumericValue(targetUnitPrice, row?.unitPrice)
        );
        let matches = numericMatches;
        if (matches.length > 1) {
          const targetDescription = params.currentCandidates.fields[`goodsLines.${index}.description`]?.[0]?.value;
          const normalizedTargetDescription = normalizeGoodsRowIdentityText(targetDescription);
          if (!normalizedTargetDescription) continue;
          matches = matches.filter((row: any) =>
            normalizeGoodsRowIdentityText(row?.description) === normalizedTargetDescription
          );
        }
        if (matches.length !== 1) continue;
        const row = matches[0];
        if (!arithmeticSupportsLineTotal(row)) continue;
        const lineTotal = numericFingerprintValue(row?.lineTotal);
        if (lineTotal === undefined) continue;

        recovered[field] = [{
          candidateId: `${params.segmentId}:adaptive-goods-numeric:${index}:${pageNumber}`,
          field,
          value: lineTotal,
          confidence: 0.99,
          extractor: "invoice-qwen-vision-adaptive-goods-numeric-v1",
          evidence: [{ segmentId: params.segmentId, pageNumber, contentSource: "PAGE_IMAGE" }]
        }];
        remaining.delete(field);
        audit.arithmeticCorroboratedFields.push(field);
        audit.matchedByNumericFingerprint.push(field);
      }
    } catch (error) {
      audit.failedPages.push({ pageNumber, error: error instanceof Error ? error.message : String(error) });
    }
  }

  audit.recoveredFields = Object.keys(recovered).sort();
  audit.arithmeticCorroboratedFields.sort();
  audit.matchedByNumericFingerprint.sort();
  if (audit.recoveredFields.length === 0) return { candidates: params.currentCandidates, audit };

  const fields = { ...params.currentCandidates.fields };
  for (const field of audit.recoveredFields) {
    fields[field] = recovered[field]!;
    audit.replacedPrimaryFields.push(field);
  }
  audit.replacedPrimaryFields.sort();
  return { candidates: { version: "1", fields }, audit };
}
