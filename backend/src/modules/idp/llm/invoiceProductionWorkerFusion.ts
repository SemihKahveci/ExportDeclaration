import { env } from "../../../config/env.js";
import type { CanonicalDocument } from "../domain/canonicalDocument.types.js";
import type { CandidateExtractionEnvelope } from "../domain/candidateExtraction.types.js";
import type { DocumentSegment } from "../domain/documentSegment.types.js";
import type { SegmentClassification } from "../domain/segmentClassification.types.js";
import { ClassifiedDocumentType } from "../domain/segmentClassification.types.js";
import type { FieldCandidateEnvelope } from "../domain/fieldCandidate.types.js";
import { QwenVisionInvoiceProvider } from "./qwenVisionInvoiceProvider.js";
import type { InvoiceLlmExtractionProvider } from "../domain/invoiceLlmExtraction.types.js";
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

const REQUESTED_FIELDS = [
  "invoiceNumber", "invoiceDate", "seller", "buyer", "currency", "deliveryTerm",
  "transportMode", "origin", "grossKg", "netKg",
  "goodsLines[].productCode", "goodsLines[].description", "goodsLines[].hsCode",
  "goodsLines[].quantity", "goodsLines[].unit", "goodsLines[].unitPrice",
  "goodsLines[].lineTotal", "goodsLines[].origin"
];

function canonicalCommercialTermsCandidatesOf(data: Record<string, unknown> | undefined): FieldCandidateEnvelope {
  const audit = data?.genericCandidateAudit as { commercialTermsCandidates?: FieldCandidateEnvelope } | undefined;
  const source = audit?.commercialTermsCandidates;
  if (source?.version !== "1" || !source.fields) return { version: "1", fields: {} };

  const fields: Record<string, FieldCandidateEnvelope["fields"][string]> = {};
  for (const [field, candidates] of Object.entries(source.fields)) {
    // The generic commercial-terms discovery predates the declaration/F6
    // vocabulary. Promote only the source-backed delivery term here; the
    // original shadow audit remains untouched.
    if (field !== "trade.deliveryTerm") continue;
    fields.deliveryTerm = candidates.map((candidate) => ({
      ...candidate,
      field: "deliveryTerm",
      candidateId: `${candidate.candidateId}:f6-delivery-term`
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
    "parties.buyer.name": "parties.buyer.name"
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
  /** Injectable seams for deterministic recovery verification; production callers omit these. */
  visionProvider?: InvoiceLlmExtractionProvider;
  renderVisionPage?: InvoiceVisionPageRenderer;
  visionModelIdentity?: string;
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
    if (!classification || !segment || classification.documentType !== ClassifiedDocumentType.INVOICE || !result.data) continue;

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
          error: page.error
        };
        await params.persistVisionCheckpoint?.(persistedCheckpoint);
      }
    });

    const deterministicFallback = mergeInvoiceCandidateSources(
      fieldCandidatesOf(result.data),
      canonicalCommercialTermsCandidatesOf(result.data),
      canonicalHeaderPartyCandidatesOf(result.data)
    );
    const fusedCandidates = plan.route === "LLM_VISION_PRIMARY"
      ? mergeInvoicePrimaryWithFallback(execution.candidates, deterministicFallback)
      : mergeInvoiceCandidateSources(deterministicFallback, execution.candidates);

    result.data = {
      ...result.data,
      fieldCandidates: associateExplicitGoodsUnitsFromQuantity({
        canonicalDocument: params.canonicalDocument,
        segmentId: result.segmentId,
        candidates: fusedCandidates
      }),
      visionCandidateAudit: {
        route: plan.route,
        checkpoints: execution.checkpoints,
        failedPages: execution.failedPages
      }
    };
  }

  return params.candidateEnvelope;
}
