import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import type { DocumentSegment } from "../../src/modules/idp/domain/documentSegment.types.js";
import { classifyDocumentSegments } from "../../src/modules/idp/classifier/segmentClassifier.js";

async function main() {
  const processingRunId = process.argv[2];
  const persist = process.argv.includes("--persist");
  if (!processingRunId) {
    throw new Error("Kullanım: npx tsx backend/scripts/idp/reclassifyProcessingRun.ts <processingRunId> [--persist]");
  }

  await mongoose.connect(env.mongoUri);
  try {
    const run = await ProcessingRunModel.findById(processingRunId);
    if (!run) throw new Error(`ProcessingRun bulunamadı: ${processingRunId}`);
    const canonical = run.canonicalDocument as CanonicalDocument | undefined;
    const segments = run.segments as DocumentSegment[] | undefined;
    if (!canonical?.pages?.length) throw new Error("ProcessingRun canonicalDocument içermiyor.");
    if (!segments?.length) throw new Error("ProcessingRun segments içermiyor; önce SEGMENT çalıştırılmalı.");

    const classifications = classifyDocumentSegments(canonical, segments);
    console.log(JSON.stringify({ processingRunId, classifications }, null, 2));

    if (persist) {
      run.classifications = classifications;
      run.markModified("classifications");
      await run.save();
      console.log(JSON.stringify({ event: "idp.reclassify.persisted", processingRunId, classificationCount: classifications.length }));
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
