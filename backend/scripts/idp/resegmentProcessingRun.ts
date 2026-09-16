import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { segmentCanonicalDocument } from "../../src/modules/idp/segmenter/documentSegmenter.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";

async function main() {
  const processingRunId = process.argv[2];
  const persist = process.argv.includes("--persist");

  if (!processingRunId) {
    throw new Error("Kullanım: npx tsx backend/scripts/idp/resegmentProcessingRun.ts <processingRunId> [--persist]");
  }

  await mongoose.connect(env.mongoUri);
  try {
    const run = await ProcessingRunModel.findById(processingRunId);
    if (!run) throw new Error(`ProcessingRun bulunamadı: ${processingRunId}`);

    const canonical = run.canonicalDocument as CanonicalDocument | undefined;
    if (!canonical?.pages?.length) throw new Error("ProcessingRun canonicalDocument içermiyor.");

    const segments = segmentCanonicalDocument(canonical);
    console.log(JSON.stringify({
      processingRunId,
      pageCount: canonical.pages.length,
      segmentCount: segments.length,
      segments
    }, null, 2));

    if (persist) {
      run.segments = segments;
      run.markModified("segments");
      await run.save();
      console.log(JSON.stringify({ event: "idp.resegment.persisted", processingRunId, segmentCount: segments.length }));
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
