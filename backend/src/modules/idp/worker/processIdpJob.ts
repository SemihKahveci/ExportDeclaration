import { ProcessingRunModel } from "../domain/processingRun.model.js";
import { ProcessingStage, ProcessingStatus } from "../domain/idp.types.js";
import { UploadedDocumentModel } from "../../documents/document.model.js";
import { extractFromUploaded } from "../../extraction/extraction.service.js";
import { analyzeUploadedPdf } from "../analyzer/pdfAnalyzer.js";

export async function processIdpJob(processingRunId: string): Promise<void> {
  const run = await ProcessingRunModel.findById(processingRunId);
  if (!run) throw new Error(`ProcessingRun bulunamadı: ${processingRunId}`);
  run.status = ProcessingStatus.PROCESSING;
  run.currentStage = ProcessingStage.EXTRACT_CONTENT;
  run.attempt += 1;
  run.startedAt ??= new Date();
  run.error = undefined;
  await run.save();

  try {
    const file = await UploadedDocumentModel.findById(run.uploadedFileId);
    if (!file) throw new Error(`UploadedFile bulunamadı: ${run.uploadedFileId}`);

    // Foundation 2.1: PDF önce belge-tipinden bağımsız Canonical Document Model'e dönüştürülür.
    // OCR, segmentation ve classification sonraki aşamalarda bu modelin üzerine eklenecek.
    run.currentStage = ProcessingStage.ANALYZE;
    await run.save();
    const canonicalDocument = await analyzeUploadedPdf(file);
    if (canonicalDocument) {
      run.canonicalDocument = canonicalDocument;
      await run.save();
    }

    // Geriye dönük uyumluluk: mevcut invoice extractor şimdilik canonical analizden sonra çalışmaya devam eder.
    run.currentStage = ProcessingStage.EXTRACT_CONTENT;
    await run.save();
    const extracted = await extractFromUploaded(file);
    run.rawExtraction = extracted.data;
    run.currentStage = ProcessingStage.FINALIZE;
    run.finalResult = extracted.data;
    run.status = ProcessingStatus.COMPLETED;
    run.completedAt = new Date();
    await run.save();

    // Geriye dönük uyumluluk: normalization henüz UploadedDocument.extractedData okuyor.
    file.extractedData = extracted.data;
    file.extractionStatus = "SUCCESS";
    file.parseErrors = [];
    await file.save();
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
