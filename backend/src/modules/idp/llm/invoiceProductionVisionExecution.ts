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
import { INVOICE_SCALAR_RECOVERY_FOCUS_INSTRUCTION } from "./invoiceExtractionSkill.js";

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
    criticalScalarRecoveryRequestedFields: string[];
    criticalScalarRecoveryAttempted: boolean;
    criticalScalarRecoveryDecision?: string;
    criticalScalarRecoveryReturnedFields: string[];
    criticalScalarRecoveryError?: string;
    originRecoveryAttempted: boolean;
    originRecoveryDecision?: string;
    originRecoveryReturned: boolean;
    originRecoveryError?: string;
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
    let criticalScalarRecoveryRequestedFields: string[] = [];
    let criticalScalarRecoveryAttempted = false;
    let criticalScalarRecoveryDecision: string | undefined;
    let criticalScalarRecoveryReturnedFields: string[] = [];
    let criticalScalarRecoveryError: string | undefined;
    let originRecoveryAttempted = false;
    let originRecoveryDecision: string | undefined;
    let originRecoveryReturned = false;
    let originRecoveryError: string | undefined;
    const pageArtifacts: InvoiceLlmExtractionArtifact[] = [];
    // 1.6.8.30: persist every recovery model execution, including fail-closed
    // zero-field responses, so real-Qwen failures remain diagnosable.
    const pushArtifact = (artifact: InvoiceLlmExtractionArtifact | undefined): void => {
      if (!artifact) return;
      if (pageArtifacts.some((item) => item.documentId === artifact.documentId)) return;
      pageArtifacts.push(artifact);
    };

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
          pushArtifact(recovery.extractionArtifact);
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

    pushArtifact(response.extractionArtifact);

    // 1.6.8.26: any usable Qwen page response may still omit independent
    // non-critical scalar fields while successfully extracting other content
    // (especially large goods tables). Ask Qwen at most once more, on the same
    // page image, only for requested scalar fields that are still missing.
    // Existing fields are never re-requested or overwritten; goods fields and
    // evidence-gated critical scalars remain excluded. Empty/fail-closed page
    // responses do not trigger this pass.
    let scalarResponse: Awaited<ReturnType<InvoiceLlmExtractionProvider["extractInvoice"]>> | undefined;
    if (response.fields.length > 0) {
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
            focusInstruction: INVOICE_SCALAR_RECOVERY_FOCUS_INSTRUCTION,
            documentId: `${params.segmentId}:page:${pageNumber}:non-critical-scalar-recovery`,
            evidenceMode: InvoiceLlmEvidenceMode.PAGE_IMAGE
          }, [image]);
          scalarRecoveryDecision = scalarRecovery.decision;
          scalarRecoveryReturnedFields = scalarRecovery.fields.map((field) => field.field);
          pushArtifact(scalarRecovery.extractionArtifact);
          if (scalarRecovery.fields.length > 0) {
            scalarResponse = scalarRecovery;
          }
        } catch (error) {
          scalarRecoveryError = error instanceof Error ? error.message : String(error);
          // Preserve the successful goods/non-critical recovery if this narrow
          // scalar pass fails. Missing scalars remain fail-closed.
        }
      }
    }

    // 1.6.9.2: invoiceDate and currency are evidence-gated critical scalars.
    // The normal non-critical recovery deliberately excludes them, which left
    // a repeated generalization gap on otherwise successful digital invoices.
    // Perform one bounded critical-scalar recovery call only for the critical
    // fields still missing from the current page response. Page-local native/OCR
    // text is assistive reading context only; qwen must still return the compact
    // criticalScalarEvidence required by the provider, and the same page image
    // remains the semantic evidence authority.
    let criticalScalarResponse: Awaited<ReturnType<InvoiceLlmExtractionProvider["extractInvoice"]>> | undefined;
    const criticalCanonicalPage = params.canonicalDocument.pages.find((page) => page.pageNumber === pageNumber);
    const criticalReturnedFields = new Set(response.fields.map((field) => field.field));
    const criticalRequestedFields = (["invoiceDate", "currency"] as const).filter(
      (field) => params.request.requestedFields.includes(field) && !criticalReturnedFields.has(field)
    );
    criticalScalarRecoveryRequestedFields = [...criticalRequestedFields];
    if (response.fields.length > 0 && criticalRequestedFields.length > 0) {
      criticalScalarRecoveryAttempted = true;
      try {
        const criticalRecovery = await params.provider.extractInvoice({
          ...params.request,
          requestedFields: [...criticalRequestedFields],
          focusInstruction: [
            "This is a critical-scalar evidence recovery pass for only the requested invoiceDate/currency fields.",
            "Inspect the entire supplied page, especially invoice header, metadata, totals, monetary columns and summary text.",
            "The page-local native/OCR text is assistive reading context for locating small or dense visible text; verify the value against the same supplied page image.",
            "For invoiceDate, extract only the actual invoice issue/date field, not due date, delivery date, order date, reference date or a date embedded into another identifier.",
            "For currency, extract only the invoice monetary currency explicitly supported by visible code/name/context; never infer it from country or locale.",
            "Return the required criticalScalarEvidence label/rawValue exactly from visible page text. If that evidence cannot support the value, return null/omit the field. Never guess."
          ].join(" "),
          nativeText: criticalCanonicalPage?.nativeText?.trim() || "",
          ocrText: criticalCanonicalPage?.ocrText?.trim() || "",
          documentId: `${params.segmentId}:page:${pageNumber}:critical-scalar-evidence-recovery`,
          evidenceMode: InvoiceLlmEvidenceMode.PAGE_IMAGE
        }, [image]);
        criticalScalarRecoveryDecision = criticalRecovery.decision;
        criticalScalarRecoveryReturnedFields = criticalRecovery.fields.map((field) => field.field);
        pushArtifact(criticalRecovery.extractionArtifact);
        if (criticalRecovery.fields.length > 0) criticalScalarResponse = criticalRecovery;
      } catch (error) {
        criticalScalarRecoveryError = error instanceof Error ? error.message : String(error);
        // Missing critical scalars remain fail-closed when grounded recovery fails.
      }
    }

    // 1.6.8.29: origin is semantically distinct from the other shipment
    // scalars and may be represented by a localized country name or an
    // established language-specific country abbreviation. If the normal and
    // general scalar passes still omit origin, perform one final bounded
    // origin-only Qwen pass on the same page image. Keeping this recovery
    // isolated prevents origin normalization guidance from perturbing goods,
    // weights, dates, currency, or other already-correct fields.
    let originResponse: Awaited<ReturnType<InvoiceLlmExtractionProvider["extractInvoice"]>> | undefined;
    const canonicalPage = params.canonicalDocument.pages.find((page) => page.pageNumber === pageNumber);
    const originRecoveryOcrText = canonicalPage?.ocrText?.trim() || "";
    const originRecoveryNativeText = canonicalPage?.nativeText?.trim() || "";
    const responseHasOrigin = response.fields.some((field) => field.field === "origin");
    const scalarHasOrigin = scalarResponse?.fields.some((field) => field.field === "origin") ?? false;
    const originWasRequested = params.request.requestedFields.includes("origin");
    if (originWasRequested && response.fields.length > 0 && !responseHasOrigin && !scalarHasOrigin) {
      originRecoveryAttempted = true;
      try {
        const originRecovery = await params.provider.extractInvoice({
          ...params.request,
          requestedFields: ["origin"],
          focusInstruction: [
            "This is an origin-only evidence recovery pass.",
            "Inspect the entire supplied page only for explicit goods/shipment country of origin (origin/menşe/menşei or semantically equivalent visible context).",
            "The page-local OCR/native text supplied with this request is assistive reading context for small or dense print; use it only to locate a possible origin token and verify that meaning against the same supplied page image.",
            "A visibly supported country name or an established language-specific country abbreviation may support origin when its country meaning is unambiguous.",
            "Normalize an unambiguous country meaning to ISO-3166-1 alpha-2.",
            "Do not use seller, buyer, address, destination, dispatch, bank country, supplier identity, expected answers, or prior documents as origin evidence.",
            "If explicit origin evidence is absent or the country meaning is ambiguous, return origin as null/omit it. Never guess."
          ].join(" "),
          nativeText: originRecoveryNativeText,
          ocrText: originRecoveryOcrText,
          documentId: `${params.segmentId}:page:${pageNumber}:origin-evidence-recovery`,
          evidenceMode: InvoiceLlmEvidenceMode.PAGE_IMAGE
        }, [image]);
        originRecoveryDecision = originRecovery.decision;
        pushArtifact(originRecovery.extractionArtifact);
        const originField = originRecovery.fields.find((field) => field.field === "origin");
        if (originField) {
          originResponse = { ...originRecovery, fields: [originField] };
          originRecoveryReturned = true;
        }
      } catch (error) {
        originRecoveryError = error instanceof Error ? error.message : String(error);
        // Existing successful extraction remains authoritative. Missing origin
        // stays fail-closed if the isolated recovery cannot establish it.
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
    const criticalScalarProjected = criticalScalarResponse ? projectVisionResponseToFieldCandidates({
      response: criticalScalarResponse,
      segmentId: params.segmentId,
      pageNumber,
      goodsLineOffset
    }) : undefined;
    const originProjected = originResponse ? projectVisionResponseToFieldCandidates({
      response: originResponse,
      segmentId: params.segmentId,
      pageNumber,
      goodsLineOffset
    }) : undefined;
    const pageProjected = mergeInvoiceCandidateSources(
      projected,
      ...(scalarProjected ? [scalarProjected] : []),
      ...(criticalScalarProjected ? [criticalScalarProjected] : []),
      ...(originProjected ? [originProjected] : [])
    );
    sources.push(pageProjected);
    const pageGoodsCount = response.fields
      .filter((field) => field.field.startsWith("goodsLines[].") && Array.isArray(field.value))
      .reduce((max, field) => Math.max(max, (field.value as unknown[]).length), 0);
    goodsLineOffset += pageGoodsCount;
    const candidateCount = Object.values(pageProjected.fields).reduce((sum, candidates) => sum + candidates.length, 0);
    const recoveryDiagnostic: InvoiceVisionCheckpoint["recoveryDiagnostic"] = {
      focusedRecoveryAttempted, focusedRecoveryUsed, scalarRecoveryRequestedFields,
      scalarRecoveryAttempted, scalarRecoveryDecision, scalarRecoveryReturnedFields, scalarRecoveryError,
      criticalScalarRecoveryRequestedFields, criticalScalarRecoveryAttempted, criticalScalarRecoveryDecision,
      criticalScalarRecoveryReturnedFields, criticalScalarRecoveryError,
      originRecoveryAttempted, originRecoveryDecision, originRecoveryReturned, originRecoveryError
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
