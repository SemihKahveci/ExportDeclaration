import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";

const FILE = process.env.PRODUCT_E2E_FILE ?? "VXA2026000000035.pdf";

function goods(value: any): any[] { return Array.isArray(value?.goodsLines) ? value.goodsLines : []; }
function segmentGoods(run: any) {
  const segments = Array.isArray(run?.candidates?.segments) ? run.candidates.segments : [];
  return segments.map((segment: any) => ({
    segmentId: segment?.segmentId,
    documentType: segment?.documentType,
    extractedGoods: goods(segment?.data),
    candidateGoodsFields: Object.keys(segment?.fieldCandidates?.fields ?? segment?.candidates?.fields ?? {})
      .filter((field) => /^goodsLines\.\d+\./.test(field)),
  }));
}

async function main() {
  await mongoose.connect(env.mongoUri);
  try {
    const upload: any = await UploadedFileModel.findOne({ fileName: FILE }).sort({ createdAt: -1 }).lean();
    assert(upload, `No persisted upload found for ${FILE}. Upload it through the product UI first.`);
    const declaration: any = await DeclarationModel.findById(upload.declarationId).lean();
    assert(declaration, `Declaration ${upload.declarationId} not found.`);
    const run: any = await ProcessingRunModel.findOne({ uploadedFileId: upload._id }).sort({ createdAt: -1 }).lean();
    assert(run, `ProcessingRun for ${FILE} not found.`);

    const normalizedGoods = goods(declaration.normalizedData);
    const report = {
      event: "product-e2e-1.8.3.volta-product-correctness.audit",
      fileName: FILE,
      uploadId: String(upload._id),
      declarationId: String(upload.declarationId),
      extractionStatus: upload.extractionStatus,
      processingRun: { id: String(run._id), status: run.status, stage: run.currentStage },
      normalizedData: {
        header: declaration.normalizedData?.header,
        parties: declaration.normalizedData?.parties,
        trade: declaration.normalizedData?.trade,
        transport: declaration.normalizedData?.transport,
        packageInfo: declaration.normalizedData?.packageInfo,
        goodsLines: normalizedGoods,
      },
      goodsCardinality: { expectedExact: 1, actual: normalizedGoods.length, pass: normalizedGoods.length === 1 },
      runEvidence: segmentGoods(run),
      guardrails: { diagnosticOnly: true, directNormalizedWrite: false, foundation6Authoritative: true },
    };
    console.log(JSON.stringify(report, null, 2));
    assert.equal(normalizedGoods.length, 1, `Volta source has exactly 1 commercial row, normalizedData has ${normalizedGoods.length}. See audit above.`);
  } finally {
    await mongoose.disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
