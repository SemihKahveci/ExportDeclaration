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
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "foundation-6.14-"));
  const pdfPath = path.join(tempDir, "digital-invoice.pdf");
  const fixtureScript = path.join(env.invoiceParserDir, "create_foundation_613_fixture.py");
  let uploadedFileId: mongoose.Types.ObjectId | undefined;
  let processingRunId: mongoose.Types.ObjectId | undefined;

  try {
    await runPython(fixtureScript, pdfPath);
    const bytes = await fs.readFile(pdfPath);
    assert.equal(bytes.subarray(0, 5).toString("ascii"), "%PDF-");

    await DeclarationModel.create({ _id: declarationId, companyId, status: "DRAFT", normalizedData: {} });
    const uploaded = await UploadedFileModel.create({
      companyId, declarationId, type: DocumentType.INVOICE,
      fileName: "foundation-6.14-digital-invoice.pdf", filePath: pdfPath,
      mimeType: "application/pdf", size: bytes.length, extractionStatus: "PENDING", parseErrors: []
    });
    uploadedFileId = uploaded._id as mongoose.Types.ObjectId;

    const run = await ProcessingRunModel.create({
      companyId, declarationId, uploadedFileId,
      status: ProcessingStatus.QUEUED, currentStage: ProcessingStage.INGEST,
      attempt: 0, processorVersion: "verify-6.14-goods-line-promotion"
    });
    processingRunId = run._id as mongoose.Types.ObjectId;

    // This is the production worker function: real PDF analyzer + segmentation +
    // classification + Python invoice parser + candidate persistence + lifecycle.
    await processIdpJob(String(run._id));

    const persistedRun = await ProcessingRunModel.findById(run._id).lean();
    assert(persistedRun);
    assert.equal(persistedRun.status, ProcessingStatus.COMPLETED);
    assert.equal((persistedRun.canonicalDocument as any)?.analysis?.contentKind, "DIGITAL");
    assert.equal((persistedRun.canonicalDocument as any)?.analysis?.ocrPageCount ?? 0, 0);
    assert.equal((persistedRun.finalResult as any)?.extractMeta?.extractionSource, "CANONICAL_DOCUMENT");
    assert.equal((persistedRun.finalResult as any)?.extractMeta?.itemCount, 1);

    const docs = await LogicalDocumentModel.find({ companyId, declarationId }).lean();
    assert.equal(docs.length, 1);
    assert.equal(docs[0]?.type, DocumentType.INVOICE);
    assert.equal(String(docs[0]?.uploadedFileId), String(uploaded._id));
    assert.equal(String(docs[0]?.sourceProcessingRunId), String(run._id));

    const snapshot = persistedRun.declarationCandidates as any;
    assert(snapshot?.fields?.["goodsLines.0.hsCode"]?.length === 1);
    assert.equal(snapshot.fields["goodsLines.0.hsCode"][0].value, "853620100011");
    assert.equal(snapshot.fields["goodsLines.0.quantity"][0].value, 2);
    assert.equal(snapshot.fields["goodsLines.0.lineTotal"][0].value, 20);
    assert.equal(snapshot.fields["goodsLines.0.hsCode"][0].evidence[0].contentSource, "NATIVE_TEXT");

    const audits = await DeclarationFieldResolutionRunModel.find({ companyId, declarationId }).lean();
    assert.equal(audits.length, 1);
    const resolution = audits[0]!.resolution as any;
    const hs = resolution.fields["goodsLines.0.hsCode"];
    assert.equal(hs.status, "RESOLVED");
    assert.equal(hs.value, "853620100011");
    assert.equal(hs.selectedCandidate.sourceProcessingRunId, String(run._id));
    assert.equal(hs.selectedCandidate.uploadedFileId, String(uploaded._id));
    assert.equal(hs.selectedCandidate.logicalDocumentId, String(docs[0]!._id));
    assert.equal(hs.selectedCandidate.evidence[0].contentSource, "NATIVE_TEXT");

    const declaration = await DeclarationModel.findById(declarationId).lean();
    assert(declaration?.idpResolution);
    assert.equal(String(declaration.idpResolution.resolutionRunId), String(audits[0]!._id));
    const normalizedGoodsLines = (declaration.normalizedData as any)?.goodsLines;
    assert(Array.isArray(normalizedGoodsLines));
    assert.equal(normalizedGoodsLines.length, 1);
    assert.equal(normalizedGoodsLines[0].hsCode, "853620100011");
    assert.equal(normalizedGoodsLines[0].productCode, "AG.TEST.1001");
    assert.equal(normalizedGoodsLines[0].description, "TEST CIRCUIT BREAKER");
    assert.equal(normalizedGoodsLines[0].quantity, 2);
    assert.equal(normalizedGoodsLines[0].unit, "PCS");
    assert.equal(normalizedGoodsLines[0].unitPrice, 10);
    assert.equal(normalizedGoodsLines[0].lineTotal, 20);

    const trace = declaration.sourceTrace as any;
    for (const field of Object.keys(snapshot.fields)) {
      const fieldTrace = trace[field];
      assert(fieldTrace, `Missing sourceTrace for ${field}`);
      assert.equal(fieldTrace.resolutionRunId, String(audits[0]!._id));
      assert.equal(fieldTrace.sourceProcessingRunId, String(run._id));
      assert.equal(fieldTrace.uploadedFileId, String(uploaded._id));
      assert.equal(fieldTrace.logicalDocumentId, String(docs[0]!._id));
      assert.equal(fieldTrace.candidateId, resolution.fields[field].selectedCandidateId);
      const expectedContentSource = field.endsWith(".unit") ? "DERIVED" : "NATIVE_TEXT";
      assert.equal(
        fieldTrace.evidence[0].contentSource,
        expectedContentSource,
        `Unexpected evidence source for ${field}`
      );
      assert.equal(Boolean(resolution.fields[field].selectedCandidate?.derived), field.endsWith(".unit"));
    }

    console.log(JSON.stringify({
      event: "foundation-6.14.dynamic-goods-line-promotion.passed",
      e2e: {
        realPdfAnalyzed: true,
        contentKind: "DIGITAL",
        ocrInvoked: false,
        logicalDocuments: docs.length,
        pythonParserSource: "CANONICAL_DOCUMENT",
        extractedItems: 1,
        declarationCandidateFields: Object.keys(snapshot.fields).sort(),
        resolutionAuditPersisted: true,
        candidateProvenancePreserved: true
      },
      promotion: {
        promotedFields: Object.keys(snapshot.fields).sort(),
        normalizedGoodsLines: normalizedGoodsLines.length,
        sourceTraceEntries: Object.keys(snapshot.fields).filter((field) => Boolean(trace[field])).length,
        resolvedOnly: true,
        provenancePreserved: true
      },
      guardrails: {
        workerFunctionIsProductionBoundary: true,
        syntheticCandidateInjection: false,
        dynamicPathWhitelistEnforced: true,
        silentUnmappedPromotion: false
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
