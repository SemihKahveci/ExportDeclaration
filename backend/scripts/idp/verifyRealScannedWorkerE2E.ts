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

async function main() {
  await mongoose.connect(env.mongoUri);
  const companyId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "foundation-6.18-"));
  const pdfPath = path.join(tempDir, "scanned-invoice.pdf");
  const fixtureScript = path.join(env.invoiceParserDir, "create_foundation_618_scanned_fixture.py");
  let uploadedFileId: mongoose.Types.ObjectId | undefined;
  let processingRunId: mongoose.Types.ObjectId | undefined;

  try {
    await runPython(fixtureScript, pdfPath);
    const bytes = await fs.readFile(pdfPath);
    assert.equal(bytes.subarray(0, 5).toString("ascii"), "%PDF-");

    await DeclarationModel.create({ _id: declarationId, companyId, status: "DRAFT", normalizedData: {} });
    const uploaded = await UploadedFileModel.create({
      companyId, declarationId, type: DocumentType.INVOICE,
      fileName: "foundation-6.18-scanned-invoice.pdf", filePath: pdfPath,
      mimeType: "application/pdf", size: bytes.length, extractionStatus: "PENDING", parseErrors: []
    });
    uploadedFileId = uploaded._id as mongoose.Types.ObjectId;

    const run = await ProcessingRunModel.create({
      companyId, declarationId, uploadedFileId,
      status: ProcessingStatus.QUEUED, currentStage: ProcessingStage.INGEST,
      attempt: 0, processorVersion: "verify-6.18-real-scanned-worker-e2e"
    });
    processingRunId = run._id as mongoose.Types.ObjectId;

    await processIdpJob(String(run._id));

    const persistedRun = await ProcessingRunModel.findById(run._id).lean();
    assert(persistedRun);
    assert.equal(persistedRun.status, ProcessingStatus.COMPLETED);
    const canonical = persistedRun.canonicalDocument as any;
    assert.equal(canonical?.analysis?.contentKind, "SCANNED");
    assert.equal(canonical?.analysis?.ocrPageCount, 1);
    assert((canonical?.analysis?.ocrWordCount ?? 0) > 0);
    assert.equal(canonical?.pages?.[0]?.ocrApplied, true);
    assert.equal((persistedRun.finalResult as any)?.extractMeta?.extractionSource, "CANONICAL_DOCUMENT");
    assert.equal((persistedRun.finalResult as any)?.extractMeta?.itemCount, 1);

    const docs = await LogicalDocumentModel.find({ companyId, declarationId }).lean();
    assert.equal(docs.length, 1);
    assert.equal(docs[0]?.type, DocumentType.INVOICE);
    assert.equal(String(docs[0]?.uploadedFileId), String(uploaded._id));
    assert.equal(String(docs[0]?.sourceProcessingRunId), String(run._id));

    const snapshot = persistedRun.declarationCandidates as any;
    const required = [
      "goodsLines.0.description", "goodsLines.0.hsCode", "goodsLines.0.lineTotal",
      "goodsLines.0.productCode", "goodsLines.0.quantity", "goodsLines.0.unit",
      "goodsLines.0.unitPrice"
    ];
    for (const field of required) assert(snapshot?.fields?.[field]?.length === 1, `Missing OCR candidate ${field}`);
    assert.equal(snapshot.fields["goodsLines.0.hsCode"][0].value, "853620100011");
    assert.equal(snapshot.fields["goodsLines.0.productCode"][0].value, "AG.TEST.1001");
    assert.equal(snapshot.fields["goodsLines.0.description"][0].value, "TEST CIRCUIT BREAKER");
    assert.equal(snapshot.fields["goodsLines.0.quantity"][0].value, 2);
    assert.equal(snapshot.fields["goodsLines.0.unitPrice"][0].value, 10);
    assert.equal(snapshot.fields["goodsLines.0.lineTotal"][0].value, 20);

    for (const field of required.filter((field) => !field.endsWith(".unit"))) {
      assert.equal(snapshot.fields[field][0].evidence[0].contentSource, "OCR", `Expected OCR evidence for ${field}`);
    }
    assert.equal(snapshot.fields["goodsLines.0.unit"][0].evidence[0].contentSource, "DERIVED");
    assert.equal(Boolean(snapshot.fields["goodsLines.0.unit"][0].derived), true);

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

    const trace = declaration?.sourceTrace as any;
    for (const field of required) {
      assert(trace?.[field], `Missing promoted sourceTrace ${field}`);
      assert.equal(trace[field].sourceProcessingRunId, String(run._id));
      assert.equal(trace[field].uploadedFileId, String(uploaded._id));
      assert.equal(trace[field].logicalDocumentId, String(docs[0]!._id));
      assert.equal(trace[field].evidence[0].contentSource, field.endsWith(".unit") ? "DERIVED" : "OCR");
    }

    console.log(JSON.stringify({
      event: "foundation-6.18.real-scanned-worker-e2e.passed",
      ocr: {
        contentKind: canonical.analysis.contentKind,
        ocrInvoked: true,
        ocrPageCount: canonical.analysis.ocrPageCount,
        ocrWordCount: canonical.analysis.ocrWordCount,
        imageOnlyFixture: true
      },
      e2e: {
        pythonParserSource: "CANONICAL_DOCUMENT",
        logicalDocuments: docs.length,
        extractedItems: 1,
        declarationCandidateFields: Object.keys(snapshot.fields).sort(),
        resolutionAuditPersisted: true,
        goodsLinePromotionPersisted: true
      },
      provenance: {
        directObservedFieldsUseOcr: true,
        derivedUnitPreserved: true,
        sourceTracePreserved: true
      },
      boundary: {
        workerFunctionIsProductionBoundary: true,
        syntheticOcrInjection: false,
        syntheticCandidateInjection: false,
        bullMqTransportCoveredHere: false
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
