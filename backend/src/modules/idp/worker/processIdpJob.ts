import { ProcessingRunModel } from "../domain/processingRun.model.js";
import { ProcessingStage, ProcessingStatus } from "../domain/idp.types.js";
import { UploadedDocumentModel } from "../../documents/document.model.js";
import { extractFromUploaded } from "../../extraction/extraction.service.js";
import { analyzeUploadedPdf } from "../analyzer/pdfAnalyzer.js";
import { enrichCanonicalDocumentWithOcr } from "../analyzer/ocrEnricher.js";
import type { CanonicalDocument } from "../domain/canonicalDocument.types.js";
import { segmentCanonicalDocument } from "../segmenter/documentSegmenter.js";
import type { DocumentSegment } from "../domain/documentSegment.types.js";
import type { SegmentClassification } from "../domain/segmentClassification.types.js";
import { classifyDocumentSegments } from "../classifier/segmentClassifier.js";
import { DocumentType } from "../../../common/enums/documentType.js";
import { extractCandidatesBySegment } from "../candidates/candidateExtractorRegistry.js";
import { resolveCandidatesWithLlm } from "../llm/resolveCandidatesWithLlm.js";
import { CandidateResolutionStatus } from "../domain/candidateResolution.types.js";
import { validateResolvedCandidate } from "../validator/documentValidatorRegistry.js";
import { ValidationStatus } from "../domain/validation.types.js";
import { materializeLogicalDocuments } from "../domain/logicalDocumentMaterializer.js";
import { tryOrchestrateDeclarationAfterProcessing } from "../domain/declarationFieldLifecycle.service.js";
import { persistWorkerCandidateExtraction } from "../domain/workerCandidatePersistence.js";
import { tryOrchestrateDeclarationIntelligenceAfterProcessing } from "../domain/declarationIntelligenceLifecycle.service.js";
import { tryOrchestrateDeclarationLlmAssistAfterProcessing } from "../llm/declarationLlmAssistLifecycle.service.js";
import { tryAssessDeclarationExceptionsAfterProcessing } from "../domain/declarationExceptionLifecycle.service.js";

function log(event: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, ...fields }));
}

/**
 * canonicalDocument is stored as Schema.Types.Mixed.
 * Mongoose does not reliably detect deep mutations inside Mixed fields,
 * so every canonical-document persistence explicitly marks the field modified.
 */
async function persistCanonicalDocument(
  run: InstanceType<typeof ProcessingRunModel>,
  canonicalDocument: CanonicalDocument
): Promise<void> {
  run.canonicalDocument = canonicalDocument;
  run.markModified("canonicalDocument");
  await run.save();
}

export async function processIdpJob(processingRunId: string, options: { allowCompletedReplay?: boolean } = {}): Promise<void> {
  const jobStartedAt = Date.now();
  const run = await ProcessingRunModel.findById(processingRunId);
  if (!run) throw new Error(`ProcessingRun bulunamadı: ${processingRunId}`);

  // At-least-once delivery may replay a terminal BullMQ job. A completed or
  // cancelled ProcessingRun is immutable from the worker perspective: do not
  // increment attempts, re-extract, or re-run declaration authority lifecycles.
  if (
    run.status === ProcessingStatus.CANCELLED ||
    (run.status === ProcessingStatus.COMPLETED && !options.allowCompletedReplay)
  ) {
    log("idp.job.terminal_replay_skipped", {
      jobId: processingRunId,
      status: run.status,
      attempt: run.attempt
    });
    return;
  }

  run.status = ProcessingStatus.PROCESSING;
  run.currentStage = ProcessingStage.INGEST;
  run.attempt += 1;
  run.startedAt ??= new Date();
  run.completedAt = undefined;
  run.error = undefined;
  await run.save();
  log("idp.job.started", { jobId: processingRunId, attempt: run.attempt });

  const stage = async <T>(name: string, currentStage: string, fn: () => Promise<T>): Promise<T> => {
    const startedAt = Date.now();
    run.currentStage = currentStage;
    await run.save();
    log("idp.stage.started", { jobId: processingRunId, stage: name });

    try {
      const value = await fn();
      log("idp.stage.completed", {
        jobId: processingRunId,
        stage: name,
        durationMs: Date.now() - startedAt
      });
      return value;
    } catch (error) {
      log("idp.stage.failed", {
        jobId: processingRunId,
        stage: name,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  };

  try {
    const file = await UploadedDocumentModel.findById(run.uploadedFileId);
    if (!file) throw new Error(`UploadedFile bulunamadı: ${run.uploadedFileId}`);

    let canonicalDocument = run.canonicalDocument as CanonicalDocument | undefined;

    if (canonicalDocument?.pages?.length) {
      log("idp.analyze.resumed_from_checkpoint", {
        jobId: processingRunId,
        pageCount: canonicalDocument.pages.length,
        ocrPageCount: canonicalDocument.analysis?.ocrPageCount ?? 0
      });
    } else {
      canonicalDocument = await stage(
        "ANALYZE",
        ProcessingStage.ANALYZE,
        async () => (await analyzeUploadedPdf(file)) ?? undefined
      );

      if (canonicalDocument) await persistCanonicalDocument(run, canonicalDocument);
    }

    let segments = run.segments as DocumentSegment[] | undefined;
    let classifications = run.classifications as SegmentClassification[] | undefined;

    if (canonicalDocument) {

      canonicalDocument = await stage(
        "OCR_ENRICH",
        ProcessingStage.EXTRACT_CONTENT,
        () =>
          enrichCanonicalDocumentWithOcr(
            file.filePath!,
            canonicalDocument!,
            async (checkpointDocument, completedPages) => {
              await persistCanonicalDocument(run, checkpointDocument);
              log("idp.ocr.checkpoint.persisted", {
                jobId: processingRunId,
                completedPages,
                ocrPageCount: checkpointDocument.analysis.ocrPageCount,
                ocrWordCount: checkpointDocument.analysis.ocrWordCount
              });
            }
          )
      );

      // Persist once more for the zero-target and final-state cases.
      await persistCanonicalDocument(run, canonicalDocument);

      segments = await stage(
        "SEGMENT",
        ProcessingStage.SEGMENT,
        async () => segmentCanonicalDocument(canonicalDocument!)
      );

      run.segments = segments;
      run.markModified("segments");
      await run.save();

      log("idp.segmentation.completed", {
        jobId: processingRunId,
        segmentCount: segments.length,
        segments: segments.map((segment) => ({
          segmentId: segment.segmentId,
          startPage: segment.startPage,
          endPage: segment.endPage,
          boundaryReason: segment.boundaryReason,
          anchor: segment.boundarySignals.anchor
        }))
      });

      classifications = await stage(
        "CLASSIFY",
        ProcessingStage.CLASSIFY,
        async () => classifyDocumentSegments(canonicalDocument!, segments!)
      );
      run.classifications = classifications;
      run.markModified("classifications");
      await run.save();

      const logicalDocuments = await materializeLogicalDocuments({
        companyId: run.companyId,
        declarationId: run.declarationId,
        uploadedFileId: run.uploadedFileId,
        processingRunId: run._id,
        segments,
        classifications
      });
      log("idp.logical_documents.materialized", { jobId: processingRunId, logicalDocumentCount: logicalDocuments.length });

      log("idp.classification.completed", {
        jobId: processingRunId,
        classificationCount: classifications.length,
        classifications: classifications.map((classification) => ({
          segmentId: classification.segmentId,
          documentType: classification.documentType,
          confidence: classification.confidence,
          method: classification.method,
          evidence: classification.evidence
        }))
      });
    }

    const isInvoiceDocument = file.type === DocumentType.INVOICE;

    let extractedData: Record<string, unknown>;

    if (isInvoiceDocument && canonicalDocument && segments?.length && classifications?.length) {
      const candidateEnvelope = await stage(
        "CANDIDATE_EXTRACT",
        ProcessingStage.EXTRACT_CANDIDATES,
        () => extractCandidatesBySegment(file, canonicalDocument!, segments!, classifications!)
      );

      await persistWorkerCandidateExtraction(run, candidateEnvelope);

      log("idp.candidate_extract.completed", {
        jobId: processingRunId,
        results: candidateEnvelope.segments.map((result) => ({
          segmentId: result.segmentId,
          documentType: result.documentType,
          status: result.status,
          extractor: result.extractor,
          pageNumbers: result.pageNumbers,
          genericCandidateAudit: (() => {
            const audit = result.data?.genericCandidateAudit as
              | { mode?: string; validation?: { status?: string; summary?: unknown } }
              | undefined;
            return audit
              ? {
                  mode: audit.mode,
                  status: audit.validation?.status,
                  summary: audit.validation?.summary
                }
              : undefined;
          })()
        }))
      });

      const resolution = await stage(
        "RESOLVE",
        ProcessingStage.RESOLVE,
        async () => resolveCandidatesWithLlm(candidateEnvelope)
      );

      run.resolvedResult = resolution;
      run.markModified("resolvedResult");
      await run.save();

      log("idp.resolve.completed", {
        jobId: processingRunId,
        status: resolution.status,
        strategy: resolution.strategy,
        documentType: resolution.documentType,
        sourceSegmentIds: resolution.sourceSegmentIds,
        issues: resolution.issues.map((issue) => issue.code),
        llmAudit: resolution.llmAudit
      });

      if (resolution.status !== CandidateResolutionStatus.RESOLVED || !resolution.data) {
        run.status = ProcessingStatus.REVIEW_REQUIRED;
        run.currentStage = ProcessingStage.RESOLVE;
        run.completedAt = new Date();
        await run.save();

        file.extractionStatus = "MANUAL_REQUIRED";
        file.parseErrors = resolution.issues.map((issue) => issue.message);
        await file.save();

        log("idp.resolve.review_required", {
          jobId: processingRunId,
          issues: resolution.issues.map((issue) => ({
            code: issue.code,
            segmentIds: issue.segmentIds
          }))
        });
        return;
      }

      const validation = await stage(
        "VALIDATE",
        ProcessingStage.VALIDATE,
        async () => validateResolvedCandidate(resolution)
      );

      run.validationResult = validation;
      run.markModified("validationResult");
      await run.save();

      log("idp.validation.completed", {
        jobId: processingRunId,
        status: validation.status,
        validator: validation.validator,
        errorCount: validation.summary.errorCount,
        warningCount: validation.summary.warningCount,
        issues: validation.issues.map((issue) => ({ code: issue.code, severity: issue.severity, path: issue.path, lineNo: issue.lineNo }))
      });

      if (validation.status !== ValidationStatus.VALID) {
        run.status = ProcessingStatus.REVIEW_REQUIRED;
        run.currentStage = ProcessingStage.VALIDATE;
        run.completedAt = new Date();
        await run.save();
        file.extractionStatus = "MANUAL_REQUIRED";
        file.parseErrors = validation.issues.filter((issue) => issue.severity === "ERROR").map((issue) => issue.message);
        await file.save();
        log("idp.validation.review_required", { jobId: processingRunId, issues: validation.issues.map((issue) => issue.code) });
        return;
      }

      extractedData = resolution.data;
    } else if (canonicalDocument && segments?.length && classifications?.length) {
      // Foundation 7.7 allows non-INVOICE document roles with registered segment
      // extractors to contribute declaration-facing evidence without pretending
      // they have an invoice resolver/validator. Unsupported roles persist an
      // empty declaration snapshot and remain available for coverage assessment.
      const candidateEnvelope = await stage(
        "CANDIDATE_EXTRACT",
        ProcessingStage.EXTRACT_CANDIDATES,
        () => extractCandidatesBySegment(file, canonicalDocument!, segments!, classifications!)
      );
      await persistWorkerCandidateExtraction(run, candidateEnvelope);
      log("idp.candidate_extract.completed", {
        jobId: processingRunId,
        results: candidateEnvelope.segments.map((result) => ({
          segmentId: result.segmentId,
          documentType: result.documentType,
          status: result.status,
          extractor: result.extractor,
          pageNumbers: result.pageNumbers,
          reason: result.reason
        }))
      });
      extractedData = { candidateExtraction: candidateEnvelope };
    } else {
      const extracted = await stage(
        "CANDIDATE_EXTRACT",
        ProcessingStage.EXTRACT_CANDIDATES,
        () => extractFromUploaded(file, { canonicalDocument })
      );
      extractedData = extracted.data;
    }

    run.rawExtraction = extractedData;
    run.currentStage = ProcessingStage.FINALIZE;
    run.finalResult = extractedData;
    run.status = ProcessingStatus.COMPLETED;
    run.completedAt = new Date();
    await run.save();

    file.extractedData = extractedData;
    file.extractionStatus = "SUCCESS";
    file.parseErrors = [];
    await file.save();

    log("idp.completed", {
      jobId: processingRunId,
      durationMs: Date.now() - jobStartedAt
    });

    // A completed file may make the whole declaration ready for cross-document
    // resolution. Readiness is evaluated from persisted logical documents/runs;
    // duplicate worker completion is safe because Foundation 6.8 is idempotent.
    try {
      const lifecycle = await tryOrchestrateDeclarationAfterProcessing({
        companyId: run.companyId,
        declarationId: run.declarationId
      });
      log("idp.declaration.lifecycle", { jobId: processingRunId, ...lifecycle });
    } catch (lifecycleError) {
      // File extraction is already durably COMPLETED. Declaration orchestration
      // fails closed independently and must never rewrite that run as FAILED.
      log("idp.declaration.lifecycle.failed", {
        jobId: processingRunId,
        error: lifecycleError instanceof Error ? lifecycleError.message : String(lifecycleError)
      });
    }

    // Foundation 7 intelligence is independently gated by an explicit policy
    // persisted on the declaration. Absence of policy is an intentional skip.
    try {
      const intelligence = await tryOrchestrateDeclarationIntelligenceAfterProcessing({
        companyId: run.companyId,
        declarationId: run.declarationId
      });
      log("idp.declaration.intelligence", { jobId: processingRunId, ...intelligence });
    } catch (intelligenceError) {
      // The file is already COMPLETED and Foundation 6 resolution is independent.
      // Intelligence failures therefore fail closed without rewriting file state.
      log("idp.declaration.intelligence.failed", {
        jobId: processingRunId,
        error: intelligenceError instanceof Error ? intelligenceError.message : String(intelligenceError)
      });
    }

    // Foundation 8 LLM assistance is a separate, explicit opt-in lifecycle.
    // Provider or authority failures never rewrite an already completed file run.
    try {
      const llmAssist = await tryOrchestrateDeclarationLlmAssistAfterProcessing({
        companyId: run.companyId,
        declarationId: run.declarationId
      });
      log("idp.declaration.llm_assist", { jobId: processingRunId, ...llmAssist });
    } catch (llmAssistError) {
      log("idp.declaration.llm_assist.failed", {
        jobId: processingRunId,
        error: llmAssistError instanceof Error ? llmAssistError.message : String(llmAssistError)
      });
    }

    // Foundation 9 exception state runs last because Foundation 8 LLM assistance
    // may legitimately create a newer Foundation 6 authority resolution. This
    // bridge therefore assesses only the final current resolution/intelligence
    // snapshots and never rewrites an already completed file run.
    try {
      const exceptions = await tryAssessDeclarationExceptionsAfterProcessing({
        companyId: run.companyId,
        declarationId: run.declarationId
      });
      log("idp.declaration.exceptions", { jobId: processingRunId, ...exceptions });
    } catch (exceptionError) {
      log("idp.declaration.exceptions.failed", {
        jobId: processingRunId,
        error: exceptionError instanceof Error ? exceptionError.message : String(exceptionError)
      });
    }
  } catch (error) {
    run.status = ProcessingStatus.FAILED;
    run.error = {
      message: error instanceof Error ? error.message : "IDP processing hatası",
      stack: error instanceof Error ? error.stack : undefined
    };
    run.completedAt = new Date();
    await run.save();
    throw error;
  }
}
