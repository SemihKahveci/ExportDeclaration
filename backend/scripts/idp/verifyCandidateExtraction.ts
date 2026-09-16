import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { extractCandidatesBySegment } from "../../src/modules/idp/candidates/candidateExtractorRegistry.js";
import type { CandidateExtractionEnvelope } from "../../src/modules/idp/domain/candidateExtraction.types.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import type { DocumentSegment } from "../../src/modules/idp/domain/documentSegment.types.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import type { SegmentClassification } from "../../src/modules/idp/domain/segmentClassification.types.js";

function summarize(envelope: CandidateExtractionEnvelope) {
  return envelope.segments.map((result) => ({
    segmentId: result.segmentId,
    documentType: result.documentType,
    status: result.status,
    extractor: result.extractor ?? null,
    pageCount: result.pageNumbers.length,
    firstPage: result.pageNumbers[0] ?? null,
    lastPage: result.pageNumbers.at(-1) ?? null,
    reason: result.reason ?? null,
    extractedLineCount: Array.isArray((result.data as any)?.lines)
      ? (result.data as any).lines.length
      : Array.isArray((result.data as any)?.items)
        ? (result.data as any).items.length
        : null
  }));
}

async function main() {
  const processingRunId = process.argv[2];
  if (!processingRunId) {
    throw new Error("Kullanım: npx tsx backend/scripts/idp/verifyCandidateExtraction.ts <processingRunId>");
  }

  await mongoose.connect(env.mongoUri);
  try {
    const run = await ProcessingRunModel.findById(processingRunId);
    if (!run) throw new Error(`ProcessingRun bulunamadı: ${processingRunId}`);

    const file = await UploadedFileModel.findById(run.uploadedFileId);
    if (!file) throw new Error(`UploadedFile bulunamadı: ${String(run.uploadedFileId)}`);

    const canonical = run.canonicalDocument as CanonicalDocument | undefined;
    const segments = run.segments as DocumentSegment[] | undefined;
    const classifications = run.classifications as SegmentClassification[] | undefined;

    if (!canonical?.pages?.length) throw new Error("ProcessingRun canonicalDocument içermiyor.");
    if (!segments?.length) throw new Error("ProcessingRun segments içermiyor.");
    if (!classifications?.length) throw new Error("ProcessingRun classifications içermiyor.");

    const envelope = await extractCandidatesBySegment(file, canonical, segments, classifications);
    const summary = summarize(envelope);

    console.log(JSON.stringify({
      processingRunId,
      sourcePageCount: canonical.pages.length,
      segmentCount: segments.length,
      classificationCount: classifications.length,
      candidateSegments: summary
    }, null, 2));

    const invoice = envelope.segments.filter((result) => result.documentType === "INVOICE");
    if (invoice.length !== 1 || invoice[0]?.status !== "EXTRACTED") {
      throw new Error(`Beklenen tam 1 EXTRACTED INVOICE candidate; bulunan=${invoice.length}`);
    }

    for (const result of envelope.segments) {
      if (result.documentType === "UNKNOWN" && result.status !== "SKIPPED") {
        throw new Error(`${result.segmentId}: UNKNOWN segment SKIPPED olmalı.`);
      }
      if (
        result.documentType !== "UNKNOWN" &&
        result.documentType !== "INVOICE" &&
        result.status !== "UNSUPPORTED"
      ) {
        throw new Error(`${result.segmentId}: kayıtlı extractor olmayan belge UNSUPPORTED olmalı.`);
      }
    }

    console.log(JSON.stringify({
      event: "idp.candidate-extraction.regression.passed",
      processingRunId,
      invoicePageCount: invoice[0].pageNumbers.length
    }));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
