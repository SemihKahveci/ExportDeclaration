import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import type { DocumentSegment } from "../../src/modules/idp/domain/documentSegment.types.js";
import type { SegmentClassification } from "../../src/modules/idp/domain/segmentClassification.types.js";
import { projectInvoiceCanonicalDocument } from "../../src/modules/idp/projector/canonicalSegmentProjector.js";

async function main() {
  const processingRunId = process.argv[2];
  if (!processingRunId) {
    throw new Error("Kullanım: npx tsx backend/scripts/idp/verifyInvoiceProjection.ts <processingRunId>");
  }

  await mongoose.connect(env.mongoUri);
  try {
    const run = await ProcessingRunModel.findById(processingRunId).lean();
    if (!run) throw new Error(`ProcessingRun bulunamadı: ${processingRunId}`);

    const canonical = run.canonicalDocument as CanonicalDocument | undefined;
    const segments = run.segments as DocumentSegment[] | undefined;
    const classifications = run.classifications as SegmentClassification[] | undefined;

    if (!canonical?.pages?.length) throw new Error("ProcessingRun canonicalDocument içermiyor.");
    if (!segments?.length) throw new Error("ProcessingRun segments içermiyor.");
    if (!classifications?.length) throw new Error("ProcessingRun classifications içermiyor; önce CLASSIFY persist edilmeli.");

    const projected = projectInvoiceCanonicalDocument(canonical, segments, classifications);
    const sourcePageNumbers = canonical.pages.map((page) => page.pageNumber);
    const selectedPageNumbers = projected?.pages.map((page) => page.pageNumber) ?? [];
    const selected = new Set(selectedPageNumbers);
    const excludedPageNumbers = sourcePageNumbers.filter((pageNumber) => !selected.has(pageNumber));
    const invoiceSegmentIds = classifications
      .filter((classification) => classification.documentType === "INVOICE")
      .map((classification) => classification.segmentId);

    console.log(JSON.stringify({
      processingRunId,
      sourcePageCount: canonical.pages.length,
      segmentCount: segments.length,
      classificationCount: classifications.length,
      invoiceSegmentIds,
      projectedPageCount: projected?.pages.length ?? 0,
      selectedPageNumbers,
      excludedPageNumbers,
      projectedAnalysis: projected?.analysis ?? null
    }, null, 2));

    if (!projected?.pages.length) process.exitCode = 2;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
