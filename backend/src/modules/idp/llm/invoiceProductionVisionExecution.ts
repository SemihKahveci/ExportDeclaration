import type { CanonicalDocument } from "../domain/canonicalDocument.types.js";
import type { FieldCandidateEnvelope } from "../domain/fieldCandidate.types.js";
import {
  InvoiceLlmEvidenceMode,
  type InvoiceLlmExtractionProvider,
  type InvoiceLlmExtractionRequest,
  type InvoiceLlmPageImage
} from "../domain/invoiceLlmExtraction.types.js";
import {
  mergeInvoiceCandidateSources,
  projectVisionResponseToFieldCandidates
} from "./invoiceProductionExtractionOrchestrator.js";

export interface InvoiceVisionPageRenderer {
  (pageNumber: number): Promise<InvoiceLlmPageImage>;
}

export interface InvoiceVisionCheckpoint {
  pageNumber: number;
  decision: string;
  candidateCount: number;
}

export interface InvoiceProductionVisionExecution {
  candidates: FieldCandidateEnvelope;
  checkpoints: InvoiceVisionCheckpoint[];
  failedPages: Array<{ pageNumber: number; error: string }>;
}

/**
 * Production-safe bounded Vision execution.
 *
 * Each page is its own inference/checkpoint boundary. A page failure is
 * recorded and does not discard candidates already extracted from other
 * pages. The returned candidates are still ordinary peer candidates; this
 * function has no persistence or normalized-data authority.
 */
export async function executeInvoiceVisionByPage(params: {
  canonicalDocument: CanonicalDocument;
  segmentId: string;
  pageNumbers: number[];
  provider: InvoiceLlmExtractionProvider;
  renderPage: InvoiceVisionPageRenderer;
  request: Omit<InvoiceLlmExtractionRequest, "documentId" | "evidenceMode">;
}): Promise<InvoiceProductionVisionExecution> {
  const validPages = new Set(params.canonicalDocument.pages.map((page) => page.pageNumber));
  const sources: FieldCandidateEnvelope[] = [];
  const checkpoints: InvoiceVisionCheckpoint[] = [];
  const failedPages: Array<{ pageNumber: number; error: string }> = [];

  let goodsLineOffset = 0;

  for (const pageNumber of params.pageNumbers) {
    if (!validPages.has(pageNumber)) {
      failedPages.push({ pageNumber, error: "PAGE_NOT_IN_CANONICAL_DOCUMENT" });
      continue;
    }

    try {
      const image = await params.renderPage(pageNumber);
      if (image.pageNumber !== pageNumber) throw new Error(`Rendered page mismatch (${image.pageNumber}/${pageNumber}).`);

      const response = await params.provider.extractInvoice({
        ...params.request,
        documentId: `${params.segmentId}:page:${pageNumber}`,
        evidenceMode: InvoiceLlmEvidenceMode.PAGE_IMAGE
      }, [image]);

      const projected = projectVisionResponseToFieldCandidates({
        response,
        segmentId: params.segmentId,
        pageNumber,
        goodsLineOffset
      });
      sources.push(projected);
      const pageGoodsCount = response.fields
        .filter((field) => field.field.startsWith("goodsLines[].") && Array.isArray(field.value))
        .reduce((max, field) => Math.max(max, (field.value as unknown[]).length), 0);
      goodsLineOffset += pageGoodsCount;
      checkpoints.push({
        pageNumber,
        decision: response.decision,
        candidateCount: Object.values(projected.fields).reduce((sum, candidates) => sum + candidates.length, 0)
      });
    } catch (error) {
      failedPages.push({
        pageNumber,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    candidates: mergeInvoiceCandidateSources(...sources),
    checkpoints,
    failedPages
  };
}
