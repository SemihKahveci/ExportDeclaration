import type { CanonicalDocument } from "../domain/canonicalDocument.types.js";
import type { FieldCandidateEnvelope } from "../domain/fieldCandidate.types.js";
import {
  InvoiceLlmEvidenceMode,
  type InvoiceLlmExtractionArtifact,
  type InvoiceLlmExtractionProvider
} from "../domain/invoiceLlmExtraction.types.js";
import { mergeInvoiceCandidateSources, projectVisionResponseToFieldCandidates } from "./invoiceProductionExtractionOrchestrator.js";
import type { InvoiceVisionPageRenderer } from "./invoiceProductionVisionExecution.js";
import { InvoiceRecoveryTool, type InvoiceAdaptiveRecoveryPlan } from "./invoiceAdaptiveRecoveryOrchestrator.js";

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
