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
    extractedLineCount: Array.isArray((result.data as any)?.goodsLines)
      ? (result.data as any).goodsLines.length
      : null
  }));
}

async function main() {
  const processingRunId = process.argv[2];
  const expectedLineCountRaw = process.argv[3];
  const expectedLineCount = expectedLineCountRaw === undefined ? undefined : Number(expectedLineCountRaw);
  if (!processingRunId) {
    throw new Error("Kullanım: npx tsx backend/scripts/idp/verifyCandidateExtraction.ts <processingRunId> [expectedLineCount]");
  }
  if (expectedLineCountRaw !== undefined && (!Number.isInteger(expectedLineCount) || expectedLineCount! < 0)) {
    throw new Error(`expectedLineCount geçersiz: ${expectedLineCountRaw}`);
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

    const goodsLines = (invoice[0]?.data as any)?.goodsLines;
    if (!Array.isArray(goodsLines) || goodsLines.length === 0) {
      throw new Error("EXTRACTED INVOICE candidate goodsLines içermiyor.");
    }
    if (expectedLineCount !== undefined && goodsLines.length !== expectedLineCount) {
      throw new Error(`Invoice goodsLines sayısı beklenenden farklı: expected=${expectedLineCount}, actual=${goodsLines.length}`);
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
      invoicePageCount: invoice[0].pageNumbers.length,
      invoiceLineCount: goodsLines.length
    }));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
