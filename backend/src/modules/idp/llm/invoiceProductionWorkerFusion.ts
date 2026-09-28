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
  planInvoiceProductionExtraction
} from "./invoiceProductionExtractionOrchestrator.js";
import { executeInvoiceVisionByPage } from "./invoiceProductionVisionExecution.js";
import { prepareInvoiceVisionCheckpoint, type PersistedInvoiceVisionCheckpoint } from "./invoiceVisionCheckpoint.js";

const REQUESTED_FIELDS = [
  "invoiceNumber", "invoiceDate", "seller", "buyer", "currency", "deliveryTerm",
  "transportMode", "origin", "grossKg", "netKg",
  "goodsLines[].productCode", "goodsLines[].description", "goodsLines[].hsCode",
  "goodsLines[].quantity", "goodsLines[].unit", "goodsLines[].unitPrice",
  "goodsLines[].lineTotal", "goodsLines[].origin"
];

function fieldCandidatesOf(data: Record<string, unknown> | undefined): FieldCandidateEnvelope {
  const value = data?.fieldCandidates as FieldCandidateEnvelope | undefined;
  return value?.version === "1" && value.fields ? value : { version: "1", fields: {} };
}

/**
 * Production worker bridge: deterministic Native/OCR candidates remain intact,
 * bounded page Vision adds peer candidates, and only the fused envelope is
 * returned for the existing persistWorkerCandidateExtraction/F6 boundary.
 *
 * Vision page failures are audit data, not a reason to discard deterministic
 * extraction. This function never writes normalizedData.
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
          candidateCount: page.candidateCount!
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
          error: page.error
        };
        await params.persistVisionCheckpoint?.(persistedCheckpoint);
      }
    });

    result.data = {
      ...result.data,
      fieldCandidates: mergeInvoiceCandidateSources(fieldCandidatesOf(result.data), execution.candidates),
      visionCandidateAudit: {
        route: plan.route,
        checkpoints: execution.checkpoints,
        failedPages: execution.failedPages
      }
    };
  }

  return params.candidateEnvelope;
}
