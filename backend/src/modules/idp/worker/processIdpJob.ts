import { ProcessingRunModel } from "../domain/processingRun.model.js";
import { ProcessingStage, ProcessingStatus } from "../domain/idp.types.js";
import { UploadedDocumentModel } from "../../documents/document.model.js";
import { extractFromUploaded } from "../../extraction/extraction.service.js";
import { analyzeUploadedPdf } from "../analyzer/pdfAnalyzer.js";
import { enrichCanonicalDocumentWithOcr } from "../analyzer/ocrEnricher.js";
import type { CanonicalDocument } from "../domain/canonicalDocument.types.js";

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

    let canonicalDocument = await stage(
      "ANALYZE",
      ProcessingStage.ANALYZE,
      () => analyzeUploadedPdf(file)
    );

    if (canonicalDocument) {
      await persistCanonicalDocument(run, canonicalDocument);

      canonicalDocument = await stage(
        "OCR_ENRICH",
        ProcessingStage.EXTRACT_CONTENT,
        () => enrichCanonicalDocumentWithOcr(file.filePath!, canonicalDocument!)
      );

      // OCR enrichment mutates nested pages/words/analysis inside the Mixed field.
      // Explicit markModified guarantees that OCR data is persisted to MongoDB.
      await persistCanonicalDocument(run, canonicalDocument);
    }

    const extracted = await stage(
      "CANDIDATE_EXTRACT",
      ProcessingStage.EXTRACT_CANDIDATES,
      () =>
        extractFromUploaded(file, {
          canonicalDocument: canonicalDocument ?? undefined
        })
    );

    run.rawExtraction = extracted.data;
    run.currentStage = ProcessingStage.FINALIZE;
    run.finalResult = extracted.data;
    run.status = ProcessingStatus.COMPLETED;
    run.completedAt = new Date();
    await run.save();

    file.extractedData = extracted.data;
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
