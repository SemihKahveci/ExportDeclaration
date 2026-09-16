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
import { extractCandidatesBySegment, getPrimaryInvoiceCandidate } from "../candidates/candidateExtractorRegistry.js";

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

export async function processIdpJob(processingRunId: string): Promise<void> {
  const jobStartedAt = Date.now();
  const run = await ProcessingRunModel.findById(processingRunId);
  if (!run) throw new Error(`ProcessingRun bulunamadı: ${processingRunId}`);

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

      run.candidates = candidateEnvelope;
      run.markModified("candidates");
      await run.save();

      log("idp.candidate_extract.completed", {
        jobId: processingRunId,
        results: candidateEnvelope.segments.map((result) => ({
          segmentId: result.segmentId,
          documentType: result.documentType,
          status: result.status,
          extractor: result.extractor,
          pageNumbers: result.pageNumbers
        }))
      });

      const invoiceData = getPrimaryInvoiceCandidate(candidateEnvelope);
      if (!invoiceData) {
        run.status = ProcessingStatus.REVIEW_REQUIRED;
        run.currentStage = ProcessingStage.EXTRACT_CANDIDATES;
        run.completedAt = new Date();
        await run.save();

        file.extractionStatus = "MANUAL_REQUIRED";
        file.parseErrors = ["INVOICE segmenti için aday veri üretilemedi."];
        await file.save();

        log("idp.candidate_extract.review_required", {
          jobId: processingRunId,
          reason: "invoice-candidate-not-produced"
        });
        return;
      }
      extractedData = invoiceData;
    } else {
      // Non-INVOICE upload types keep their existing dedicated extraction path until
      // their classified segment extractors are registered in this registry.
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
