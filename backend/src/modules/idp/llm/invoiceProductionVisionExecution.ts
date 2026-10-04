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
  extractionArtifacts?: InvoiceLlmExtractionArtifact[];
  recoveryDiagnostic?: {
    focusedRecoveryAttempted: boolean;
    focusedRecoveryUsed: boolean;
    scalarRecoveryRequestedFields: string[];
    scalarRecoveryAttempted: boolean;
    scalarRecoveryDecision?: string;
    scalarRecoveryReturnedFields: string[];
    scalarRecoveryError?: string;
  };
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
    extractionArtifacts?: InvoiceLlmExtractionArtifact[];
    recoveryDiagnostic?: InvoiceVisionCheckpoint["recoveryDiagnostic"];
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

    let focusedRecoveryUsed = false;
    let focusedRecoveryAttempted = false;
    let scalarRecoveryRequestedFields: string[] = [];
    let scalarRecoveryAttempted = false;
    let scalarRecoveryDecision: string | undefined;
    let scalarRecoveryReturnedFields: string[] = [];
    let scalarRecoveryError: string | undefined;
    const pageArtifacts: InvoiceLlmExtractionArtifact[] = [];

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
        focusedRecoveryAttempted = true;
        try {
          const recovery = await params.provider.extractInvoice({
            ...params.request,
            requestedFields: recoveryRequestedFields,
            focusInstruction: "This is a focused non-critical recovery pass. Inspect the entire page for every requested field independently. Do not stop after extracting goods lines. Also inspect headers, footers, totals and summary areas for requested scalar fields such as gross/net weight, origin and delivery terms. Return null/omit only when a requested value is not visibly supported.",
            documentId: `${params.segmentId}:page:${pageNumber}:non-critical-recovery`,
            evidenceMode: InvoiceLlmEvidenceMode.PAGE_IMAGE
          }, [image]);
          if (recovery.fields.length > 0) {
            response = recovery;
            focusedRecoveryUsed = true;
          }
        } catch {
          // The original fail-closed response remains authoritative when the
          // focused recovery call itself fails. Page-level execution continues.
        }
      }
    }

    if (response.extractionArtifact) pageArtifacts.push(response.extractionArtifact);

    // 1.6.8.24: when the bounded empty-page recovery succeeds primarily on a
    // goods-heavy table, ask Qwen once more only for still-missing non-critical
    // scalar fields. This keeps semantic extraction with Qwen while separating
    // the small header/footer/summary task from large goods JSON generation.
    // It is intentionally limited to pages that actually needed the focused
    // recovery; normal non-empty pages incur no additional inference.
    let scalarResponse: Awaited<ReturnType<InvoiceLlmExtractionProvider["extractInvoice"]>> | undefined;
    if (focusedRecoveryUsed) {
      const returnedFields = new Set(response.fields.map((field) => field.field));
      const scalarRequestedFields = params.request.requestedFields.filter(
        (field) => field !== "invoiceDate"
          && field !== "currency"
          && !field.startsWith("goodsLines[].")
          && !returnedFields.has(field)
      );
      scalarRecoveryRequestedFields = [...scalarRequestedFields];
      if (scalarRequestedFields.length > 0) {
        scalarRecoveryAttempted = true;
        try {
          const scalarRecovery = await params.provider.extractInvoice({
            ...params.request,
            requestedFields: scalarRequestedFields,
            focusInstruction: "This is a scalar-only recovery pass. Ignore goods/table rows. Inspect the entire page, especially headers, footers, totals and summary areas, and extract only the requested scalar fields when visibly supported. Do not infer or calculate missing values; return null/omit unsupported fields.",
            documentId: `${params.segmentId}:page:${pageNumber}:non-critical-scalar-recovery`,
            evidenceMode: InvoiceLlmEvidenceMode.PAGE_IMAGE
          }, [image]);
          scalarRecoveryDecision = scalarRecovery.decision;
          scalarRecoveryReturnedFields = scalarRecovery.fields.map((field) => field.field);
          if (scalarRecovery.fields.length > 0) {
            scalarResponse = scalarRecovery;
            if (scalarRecovery.extractionArtifact) pageArtifacts.push(scalarRecovery.extractionArtifact);
          }
        } catch (error) {
          scalarRecoveryError = error instanceof Error ? error.message : String(error);
          // Preserve the successful goods/non-critical recovery if this narrow
          // scalar pass fails. Missing scalars remain fail-closed.
        }
      }
    }

    const projected = projectVisionResponseToFieldCandidates({
      response,
      segmentId: params.segmentId,
      pageNumber,
      goodsLineOffset
    });
    const scalarProjected = scalarResponse ? projectVisionResponseToFieldCandidates({
      response: scalarResponse,
      segmentId: params.segmentId,
      pageNumber,
      goodsLineOffset
    }) : undefined;
    const pageProjected = scalarProjected
      ? mergeInvoiceCandidateSources(projected, scalarProjected)
      : projected;
    sources.push(pageProjected);
    const pageGoodsCount = response.fields
      .filter((field) => field.field.startsWith("goodsLines[].") && Array.isArray(field.value))
      .reduce((max, field) => Math.max(max, (field.value as unknown[]).length), 0);
    goodsLineOffset += pageGoodsCount;
    const candidateCount = Object.values(pageProjected.fields).reduce((sum, candidates) => sum + candidates.length, 0);
    const recoveryDiagnostic: InvoiceVisionCheckpoint["recoveryDiagnostic"] = {
      focusedRecoveryAttempted, focusedRecoveryUsed, scalarRecoveryRequestedFields,
      scalarRecoveryAttempted, scalarRecoveryDecision, scalarRecoveryReturnedFields, scalarRecoveryError
    };
    checkpoints.push({ pageNumber, decision: response.decision, candidateCount, extractionArtifact: response.extractionArtifact, extractionArtifacts: pageArtifacts, recoveryDiagnostic });
    await params.onPageCheckpoint?.({
      pageNumber,
      status: "COMPLETED",
      decision: response.decision,
      candidateCount,
      candidates: pageProjected,
      extractionArtifact: response.extractionArtifact,
      extractionArtifacts: pageArtifacts,
      recoveryDiagnostic
    });
  }

  return {
    candidates: mergeInvoiceCandidateSources(...sources),
    checkpoints,
    failedPages
  };
}
