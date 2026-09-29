import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { PRODUCT_E2E_CORPUS_CASES } from "./productE2ECorpusGroundTruth.js";

const TARGETS: Record<string, string[]> = {
  "clk-celikel": ["invoiceNo"],
  "makro-boya": ["goodsLines.0.description", "goodsLines.0.unitPrice"]
};

function compact(candidate: any) {
  return {
    value: candidate?.value,
    confidence: candidate?.confidence,
    extractor: candidate?.extractor,
    derived: candidate?.derived === true,
    candidateId: candidate?.candidateId,
    evidence: Array.isArray(candidate?.evidence) ? candidate.evidence.map((item: any) => ({
      contentSource: item?.contentSource,
      pageNumber: item?.pageNumber,
      text: item?.text,
      bbox: item?.bbox
    })) : []
  };
}

function selectedFields(envelope: any, fields: string[]) {
  return Object.fromEntries(fields.map((field) => [
    field,
    Array.isArray(envelope?.fields?.[field]) ? envelope.fields[field].map(compact) : []
  ]));
}

async function latestRunForCase(id: "clk-celikel" | "makro-boya") {
  const corpus = PRODUCT_E2E_CORPUS_CASES.find((item) => item.id === id);
  assert(corpus, `${id} corpus case is required.`);

  const upload = await UploadedFileModel.findOne({ fileName: corpus.pdf }).sort({ createdAt: -1 }).lean();
  assert(upload, `No persisted uploaded file found for ${id} (${corpus.pdf}). Run its product E2E case first.`);

  const run = await ProcessingRunModel.findOne({ uploadedFileId: upload._id }).sort({ createdAt: -1 }).lean();
  assert(run, `No persisted ProcessingRun found for ${id}. Run its product E2E case first.`);

  const targets = TARGETS[id];
  return {
    id,
    pdf: corpus.pdf,
    processingRunId: String(run._id),
    status: run.status,
    currentStage: run.currentStage,
    processorVersion: run.processorVersion,
    targets,
    declarationCandidates: selectedFields(run.declarationCandidates, targets),
    workerCandidateSegments: Array.isArray((run.candidates as any)?.segments)
      ? (run.candidates as any).segments.map((segment: any) => ({
          segmentId: segment?.segmentId,
          fields: selectedFields(segment?.data?.fieldCandidates, targets)
        }))
      : [],
    resolvedResult: run.resolvedResult ?? null
  };
}

async function main() {
  await mongoose.connect(env.mongoUri);
  try {
    const cases = [
      await latestRunForCase("clk-celikel"),
      await latestRunForCase("makro-boya")
    ];
    console.log(JSON.stringify({
      event: "product-e2e-1.5.24.persisted-authority-conflict-diagnostic.measured",
      cases,
      guardrails: {
        measurementOnly: true,
        noModelInferenceRequired: true,
        noDatabaseMutation: true,
        readsLatestPersistedProductE2ERuns: true,
        customerPdfsCommitted: false,
        directNormalizedWrite: false
      }
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
