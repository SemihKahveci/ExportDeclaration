import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";

function arg(name: string, fallback: number): number {
  const hit = process.argv.find(v => v.startsWith(`${name}=`));
  const value = hit ? Number(hit.slice(name.length + 1)) : fallback;
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

async function main(): Promise<void> {
  const limit = Math.min(arg("--limit", 7), 100);
  await mongoose.connect(env.mongoUri);
  try {
    const runs = await ProcessingRunModel.find({ status: "COMPLETED" }).sort({ completedAt: -1, createdAt: -1 }).limit(limit).lean();
    const report = [];
    for (const run of runs) {
      const [upload, declaration] = await Promise.all([
        UploadedFileModel.findById(run.uploadedFileId).lean(),
        DeclarationModel.findById(run.declarationId).lean()
      ]);
      const extraction = run.candidates as any;
      const segments = Array.isArray(extraction?.segments) ? extraction.segments : undefined;
      report.push({
        fileName: upload?.fileName ?? null,
        runId: String(run._id),
        declarationId: String(run.declarationId),
        uploadedFileId: String(run.uploadedFileId),
        status: run.status,
        processorVersion: run.processorVersion,
        createdAt: run.createdAt,
        completedAt: run.completedAt,
        normalizedData: (declaration as any)?.normalizedData ?? null,
        sourceTrace: (declaration as any)?.sourceTrace ?? null,
        foundation8: segments?.map((segment: any) => ({
          segmentId: segment?.segmentId ?? null,
          specialistModelAudit: segment?.data?.foundation8SpecialistModelAudit ?? null,
          reconciliationAudit: segment?.data?.foundation8SpecialistReconciliationAudit ?? null,
          promotionAudit: segment?.data?.foundation8ReconciledPromotionAudit ?? null
        })) ?? null,
        candidates: run.candidates ?? null,
        finalResult: run.finalResult ?? null,
        resolvedResult: run.resolvedResult ?? null,
        validationResult: run.validationResult ?? null,
        modelExtractionArtifacts: run.modelExtractionArtifacts ?? null,
        declarationCandidates: run.declarationCandidates ?? null
      });
    }
    process.stdout.write(`${JSON.stringify({ generatedAt: new Date().toISOString(), limit, count: report.length, runs: report }, null, 2)}\n`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
