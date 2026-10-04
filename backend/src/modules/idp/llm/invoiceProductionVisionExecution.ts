import type { CanonicalDocument } from "../domain/canonicalDocument.types.js";
import type { FieldCandidateEnvelope } from "../domain/fieldCandidate.types.js";
import {
  InvoiceLlmEvidenceMode,
  type InvoiceLlmExtractionArtifact,
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
  extractionArtifact?: InvoiceLlmExtractionArtifact;
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
  completedPages?: Record<number, { candidates: FieldCandidateEnvelope; decision: string; candidateCount: number; extractionArtifact?: InvoiceLlmExtractionArtifact }>;
  onPageCheckpoint?: (checkpoint: {
    pageNumber: number;
    status: "COMPLETED" | "FAILED";
    decision?: string;
    candidateCount?: number;
    candidates?: FieldCandidateEnvelope;
    extractionArtifact?: InvoiceLlmExtractionArtifact;
    error?: string;
  }) => Promise<void>;
}): Promise<InvoiceProductionVisionExecution> {
  const validPages = new Set(params.canonicalDocument.pages.map((page) => page.pageNumber));
  const sources: FieldCandidateEnvelope[] = [];
  const checkpoints: InvoiceVisionCheckpoint[] = [];
  const failedPages: Array<{ pageNumber: number; error: string }> = [];

  let goodsLineOffset = 0;

  const isRetryableAbort = (error: unknown): boolean => {
    if (!(error instanceof Error)) return false;
    const name = error.name.toLowerCase();
    const message = error.message.toLowerCase();
    return name === "aborterror"
      || message.includes("operation was aborted")
      || message.includes("operation was canceled")
      || message.includes("operation was cancelled")
      || message.includes("aborted");
  };

  for (const pageNumber of params.pageNumbers) {
    const persisted = params.completedPages?.[pageNumber];
    if (persisted) {
      sources.push(persisted.candidates);
      checkpoints.push({ pageNumber, decision: persisted.decision, candidateCount: persisted.candidateCount, extractionArtifact: persisted.extractionArtifact });
      const persistedGoodsCount = Object.keys(persisted.candidates.fields)
        .map((field) => /^goodsLines\.(\d+)\./.exec(field)?.[1])
        .filter((value): value is string => Boolean(value))
        .reduce((max, value) => Math.max(max, Number(value) + 1), 0);
      goodsLineOffset = Math.max(goodsLineOffset, persistedGoodsCount);
      continue;
    }

    if (!validPages.has(pageNumber)) {
      failedPages.push({ pageNumber, error: "PAGE_NOT_IN_CANONICAL_DOCUMENT" });
      continue;
    }

    const image = await params.renderPage(pageNumber);
    if (image.pageNumber !== pageNumber) {
      const message = `Rendered page mismatch (${image.pageNumber}/${pageNumber}).`;
      failedPages.push({ pageNumber, error: message });
      await params.onPageCheckpoint?.({ pageNumber, status: "FAILED", error: message });
      continue;
    }

    let response: Awaited<ReturnType<InvoiceLlmExtractionProvider["extractInvoice"]>> | undefined;
    let terminalError: unknown;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        response = await params.provider.extractInvoice({
          ...params.request,
          documentId: `${params.segmentId}:page:${pageNumber}`,
          evidenceMode: InvoiceLlmEvidenceMode.PAGE_IMAGE
        }, [image]);
        terminalError = undefined;
        break;
      } catch (error) {
        terminalError = error;
        if (attempt >= 2 || !isRetryableAbort(error)) break;
      }
    }

    if (!response) {
      const message = terminalError instanceof Error ? terminalError.message : String(terminalError);
      failedPages.push({ pageNumber, error: message });
      await params.onPageCheckpoint?.({ pageNumber, status: "FAILED", error: message });
      continue;
    }

    // 1.6.8.21: a completely empty semantic response can happen when the
    // model correctly fails closed on critical scalars but prematurely stops
    // before extracting unrelated page content. Recover with one focused Qwen
    // pass that excludes only the evidence-gated critical scalars. This is not
    // OCR/deterministic authority: the same page image and Qwen provider remain
    // the primary evidence source. Normal non-empty responses pay no retry cost.
    if (response.decision === "REVIEW_REQUIRED" && response.fields.length === 0) {
      const recoveryRequestedFields = params.request.requestedFields.filter(
        (field) => field !== "invoiceDate" && field !== "currency"
      );
      if (recoveryRequestedFields.length > 0) {
        try {
          const recovery = await params.provider.extractInvoice({
            ...params.request,
            requestedFields: recoveryRequestedFields,
            documentId: `${params.segmentId}:page:${pageNumber}:non-critical-recovery`,
            evidenceMode: InvoiceLlmEvidenceMode.PAGE_IMAGE
          }, [image]);
          if (recovery.fields.length > 0) response = recovery;
        } catch {
          // The original fail-closed response remains authoritative when the
          // focused recovery call itself fails. Page-level execution continues.
        }
      }
    }

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
    const candidateCount = Object.values(projected.fields).reduce((sum, candidates) => sum + candidates.length, 0);
    checkpoints.push({ pageNumber, decision: response.decision, candidateCount, extractionArtifact: response.extractionArtifact });
    await params.onPageCheckpoint?.({
      pageNumber,
      status: "COMPLETED",
      decision: response.decision,
      candidateCount,
      candidates: projected,
      extractionArtifact: response.extractionArtifact
    });
  }

  return {
    candidates: mergeInvoiceCandidateSources(...sources),
    checkpoints,
    failedPages
  };
}
