import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DocumentType } from "../../src/common/enums/documentType.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { LogicalDocumentModel } from "../../src/modules/idp/domain/logicalDocument.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { DeclarationFieldResolutionRunModel } from "../../src/modules/idp/domain/declarationFieldResolution.model.js";
import { ProcessingStage, ProcessingStatus } from "../../src/modules/idp/domain/idp.types.js";
import { processIdpJob } from "../../src/modules/idp/worker/processIdpJob.js";

function runPython(script: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(env.invoiceParserPython, [script, output], {
      cwd: path.dirname(script), env: process.env, windowsHide: true
    });
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`fixture generator exit=${code}: ${stderr.trim()}`)));
  });
}

function ocrFingerprint(canonical: any): string {
  return JSON.stringify(
    (canonical?.pages ?? []).map((page: any) => ({
      pageNumber: page.pageNumber,
      ocrApplied: Boolean(page.ocrApplied),
      ocrWordCount: page.ocrWordCount ?? 0,
      ocrWords: (page.words ?? [])
        .filter((word: any) => word.source === "OCR")
        .map((word: any) => [word.text, word.bbox])
    }))
  );
}

async function main() {
  await mongoose.connect(env.mongoUri);
  const companyId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "foundation-6.19-"));
  const pdfPath = path.join(tempDir, "mixed-invoice.pdf");
  const fixtureScript = path.join(env.invoiceParserDir, "create_foundation_619_mixed_fixture.py");
  let uploadedFileId: mongoose.Types.ObjectId | undefined;
  let processingRunId: mongoose.Types.ObjectId | undefined;

  try {
    await runPython(fixtureScript, pdfPath);
    const bytes = await fs.readFile(pdfPath);
    assert.equal(bytes.subarray(0, 5).toString("ascii"), "%PDF-");

    await DeclarationModel.create({ _id: declarationId, companyId, status: "DRAFT", normalizedData: {} });
    const uploaded = await UploadedFileModel.create({
      companyId, declarationId, type: DocumentType.INVOICE,
      fileName: "foundation-6.19-mixed-invoice.pdf", filePath: pdfPath,
      mimeType: "application/pdf", size: bytes.length, extractionStatus: "PENDING", parseErrors: []
    });
    uploadedFileId = uploaded._id as mongoose.Types.ObjectId;

    const run = await ProcessingRunModel.create({
      companyId, declarationId, uploadedFileId,
      status: ProcessingStatus.QUEUED, currentStage: ProcessingStage.INGEST,
      attempt: 0, processorVersion: "verify-6.19-mixed-checkpoint-replay"
    });
    processingRunId = run._id as mongoose.Types.ObjectId;

    await processIdpJob(String(run._id));

    const first = await ProcessingRunModel.findById(run._id).lean();
    assert(first);
    assert.equal(first.status, ProcessingStatus.COMPLETED);
    assert.equal(first.attempt, 1);
    const firstCanonical = first.canonicalDocument as any;
    assert.equal(firstCanonical?.analysis?.contentKind, "MIXED");
    assert.equal(firstCanonical?.analysis?.pageCount, 2);
    assert.equal(firstCanonical?.analysis?.digitalPageCount, 1);
    assert.equal(firstCanonical?.analysis?.scannedPageCount, 1);
    assert.equal(firstCanonical?.analysis?.ocrPageCount, 1);
    assert((firstCanonical?.analysis?.ocrWordCount ?? 0) > 0);
    assert.equal(firstCanonical?.pages?.[0]?.contentKind, "DIGITAL");
    assert.equal(Boolean(firstCanonical?.pages?.[0]?.ocrApplied), false);
    assert.equal(firstCanonical?.pages?.[1]?.contentKind, "SCANNED");
    assert.equal(firstCanonical?.pages?.[1]?.ocrApplied, true);

    const firstOcrCount = firstCanonical.analysis.ocrWordCount;
    const firstFingerprint = ocrFingerprint(firstCanonical);
    const firstDeclaration = await DeclarationModel.findById(declarationId).lean();
    const firstGoods = (firstDeclaration?.normalizedData as any)?.goodsLines;
    assert(Array.isArray(firstGoods));
    assert.equal(firstGoods.length, 1);
    assert.equal(firstGoods[0].hsCode, "853620100011");
    assert.equal(firstGoods[0].productCode, "AG.TEST.1001");
    assert.equal(firstGoods[0].description, "TEST CIRCUIT BREAKER");

    const firstSnapshot = first.declarationCandidates as any;
    assert.equal(firstSnapshot.fields["goodsLines.0.hsCode"][0].evidence[0].contentSource, "NATIVE_TEXT");
    assert.equal(firstSnapshot.fields["goodsLines.0.productCode"][0].evidence[0].contentSource, "NATIVE_TEXT");

    // Replay the exact persisted ProcessingRun. This exercises the production
    // checkpoint-resume branch: canonicalDocument already exists and the only
    // OCR target page is already marked ocrApplied=true.
    await processIdpJob(String(run._id));

    const second = await ProcessingRunModel.findById(run._id).lean();
    assert(second);
    assert.equal(second.status, ProcessingStatus.COMPLETED);
    assert.equal(second.attempt, 2);
    const secondCanonical = second.canonicalDocument as any;
    assert.equal(secondCanonical.analysis.contentKind, "MIXED");
    assert.equal(secondCanonical.analysis.ocrPageCount, 1);
    assert.equal(secondCanonical.analysis.ocrWordCount, firstOcrCount);
    assert.equal(ocrFingerprint(secondCanonical), firstFingerprint);

    const docs = await LogicalDocumentModel.find({ companyId, declarationId }).lean();
    assert.equal(docs.length, 1);
    assert.equal(String(docs[0]?.uploadedFileId), String(uploaded._id));
    assert.equal(String(docs[0]?.sourceProcessingRunId), String(run._id));

    const audits = await DeclarationFieldResolutionRunModel.find({ companyId, declarationId }).lean();
    assert.equal(audits.length, 1);

    const declaration = await DeclarationModel.findById(declarationId).lean();
    const goods = (declaration?.normalizedData as any)?.goodsLines;
    assert(Array.isArray(goods));
    assert.equal(goods.length, 1);
    assert.equal(goods[0].hsCode, "853620100011");
    assert.equal(goods[0].productCode, "AG.TEST.1001");
    assert.equal(goods[0].description, "TEST CIRCUIT BREAKER");
    assert.equal(goods[0].quantity, 2);
    assert.equal(goods[0].unit, "PCS");
    assert.equal(goods[0].unitPrice, 10);
    assert.equal(goods[0].lineTotal, 20);
    assert(
      goods[0]._id instanceof mongoose.Types.ObjectId,
      "Replay must preserve the Mongoose goods-line ObjectId instead of cloning it into a plain BSON buffer object."
    );

    const trace = declaration?.sourceTrace as any;
    assert.equal(trace?.["goodsLines.0.hsCode"]?.sourceProcessingRunId, String(run._id));
    assert.equal(trace?.["goodsLines.0.hsCode"]?.evidence?.[0]?.contentSource, "NATIVE_TEXT");

    console.log(JSON.stringify({
      event: "foundation-6.19.mixed-checkpoint-replay.passed",
      mixed: {
        contentKind: secondCanonical.analysis.contentKind,
        pageCount: secondCanonical.analysis.pageCount,
        digitalPages: secondCanonical.analysis.digitalPageCount,
        scannedPages: secondCanonical.analysis.scannedPageCount,
        ocrAppliedPages: secondCanonical.analysis.ocrPageCount,
        selectiveOcrPreserved: true
      },
      checkpointReplay: {
        checkpointReplayAttempt: second.attempt,
        persistedCanonicalReused: true,
        ocrWordCountBefore: firstOcrCount,
        ocrWordCountAfter: secondCanonical.analysis.ocrWordCount,
        ocrFingerprintUnchanged: true,
        duplicateOcrWordsAdded: false
      },
      idempotency: {
        logicalDocuments: docs.length,
        resolutionAuditCount: audits.length,
        duplicateLogicalDocumentCreated: false,
        duplicateResolutionAuditCreated: false,
        normalizedPromotionStable: true
      },
      provenance: {
        digitalGoodsFieldsRemainNativeText: true,
        sourceTracePreserved: true
      },
      boundary: {
        productionWorkerReplayUsed: true,
        syntheticOcrInjection: false,
        productionFailureHookAdded: false,
        arbitraryMidInferenceCrashSimulated: false
      }
    }, null, 2));
  } finally {
    await DeclarationFieldResolutionRunModel.deleteMany({ declarationId });
    await LogicalDocumentModel.deleteMany({ declarationId });
    if (processingRunId) await ProcessingRunModel.deleteMany({ _id: processingRunId });
    if (uploadedFileId) await UploadedFileModel.deleteMany({ _id: uploadedFileId });
    await DeclarationModel.deleteMany({ _id: declarationId });
    await fs.rm(tempDir, { recursive: true, force: true });
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
