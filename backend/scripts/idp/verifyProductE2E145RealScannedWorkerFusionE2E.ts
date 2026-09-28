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
  assert.equal(env.llmEnabled, true, "1.4.5 requires LLM_ENABLED=true.");
  assert.equal(env.llmVisionEnabled, true, "1.4.5 requires LLM_VISION_ENABLED=true.");

  await mongoose.connect(env.mongoUri);
  const companyId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "product-e2e-1.4.5-"));
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
      fileName: "product-e2e-1.4.5-scanned-invoice.pdf", filePath: pdfPath,
      mimeType: "application/pdf", size: bytes.length, extractionStatus: "PENDING", parseErrors: []
    });
    uploadedFileId = uploaded._id as mongoose.Types.ObjectId;

    const run = await ProcessingRunModel.create({
      companyId, declarationId, uploadedFileId,
      status: ProcessingStatus.QUEUED, currentStage: ProcessingStage.INGEST,
      attempt: 0, processorVersion: "product-e2e-1.4.5-real-scanned-worker-fusion"
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

    const raw = persistedRun.candidates as any;
    const invoiceSegment = raw?.segments?.find((segment: any) => segment?.documentType === "INVOICE");
    assert(invoiceSegment, "Persisted INVOICE segment missing.");
    const visionAudit = invoiceSegment.data?.visionCandidateAudit;
    assert(visionAudit, "Production SCANNED worker did not persist visionCandidateAudit.");
    assert.equal(visionAudit.failedPages?.length ?? 0, 0, `Vision page failed: ${JSON.stringify(visionAudit.failedPages)}`);
    assert((visionAudit.checkpoints?.length ?? 0) >= 1, "No successful SCANNED Vision page checkpoint.");

    const snapshot = persistedRun.declarationCandidates as any;
    const allCandidates = Object.values(snapshot?.fields ?? {}).flat() as any[];
    const ocrCandidates = allCandidates.filter((candidate) =>
      candidate?.evidence?.some((e: any) => e.contentSource === "OCR"));
    const derivedCandidates = allCandidates.filter((candidate) =>
      candidate?.evidence?.some((e: any) => e.contentSource === "DERIVED"));
    const visionCandidates = allCandidates.filter((candidate) =>
      candidate?.evidence?.some((e: any) => e.contentSource === "PAGE_IMAGE"));
    assert(ocrCandidates.length > 0, "Real PaddleOCR candidates disappeared after production fusion.");
    assert(visionCandidates.length > 0, "Real Vision inference produced no persisted PAGE_IMAGE candidates for SCANNED input.");

    const required = [
      "goodsLines.0.description", "goodsLines.0.hsCode", "goodsLines.0.lineTotal",
      "goodsLines.0.productCode", "goodsLines.0.quantity", "goodsLines.0.unit",
      "goodsLines.0.unitPrice"
    ];
    for (const field of required) assert((snapshot?.fields?.[field]?.length ?? 0) >= 1, `Missing fused candidate ${field}`);

    const ocrHs = snapshot.fields["goodsLines.0.hsCode"].find((candidate: any) =>
      candidate?.evidence?.some((e: any) => e.contentSource === "OCR"));
    assert(ocrHs, "Original OCR HS candidate was lost during Vision fusion.");
    assert.equal(ocrHs.value, "853620100011");

    const audits = await DeclarationFieldResolutionRunModel.find({ companyId, declarationId }).lean();
    assert.equal(audits.length, 1);
    const declaration = await DeclarationModel.findById(declarationId).lean();
    const goods = (declaration?.normalizedData as any)?.goodsLines;
    assert(Array.isArray(goods));
    assert(goods.length >= 1, "Declaration lifecycle did not promote a goods line.");

    const trace = declaration?.sourceTrace as any;
    const resolution = audits[0] as any;
    const resolutionFields = resolution?.fields ?? resolution?.resolutions ?? {};
    const promotedFields = required.filter((field) => Boolean(trace?.[field]));
    const reviewRequiredFields = required.filter((field) => !trace?.[field]);

    assert(promotedFields.length > 0, "F6 lifecycle promoted none of the expected goods fields.");
    for (const field of promotedFields) {
      assert.equal(trace[field].sourceProcessingRunId, String(run._id));
      assert.equal(trace[field].uploadedFileId, String(uploaded._id));
      assert.equal(trace[field].logicalDocumentId, String(docs[0]!._id));
      const selectedSource = trace[field].evidence?.[0]?.contentSource;
      assert(
        selectedSource === "OCR" || selectedSource === "DERIVED" || selectedSource === "PAGE_IMAGE",
        `Unexpected promoted evidence source for ${field}: ${selectedSource}`
      );
    }

    // A fused candidate is not required to win authority. If F6 leaves a field for
    // review, the important guardrail is that it remains unpromoted rather than
    // being silently written to normalizedData/sourceTrace.
    for (const field of reviewRequiredFields) {
      assert.equal(trace?.[field], undefined, `Review-required field was unexpectedly promoted: ${field}`);
      const candidates = snapshot?.fields?.[field] ?? [];
      assert(candidates.length >= 1, `Review-required field lost its fused candidates: ${field}`);
    }

    console.log(JSON.stringify({
      event: "product-e2e-1.4.5.real-scanned-worker-fusion-e2e.passed",
      workerCompleted: true,
      scannedInputConfirmed: canonical.analysis.contentKind === "SCANNED",
      realPaddleOcrInvoked: canonical.analysis.ocrPageCount === 1 && canonical.analysis.ocrWordCount > 0,
      realConfiguredVisionProviderInvoked: true,
      visionPageCheckpoints: visionAudit.checkpoints.length,
      visionFailedPages: visionAudit.failedPages.length,
      ocrCandidateCount: ocrCandidates.length,
      derivedCandidateCount: derivedCandidates.length,
      visionCandidateCount: visionCandidates.length,
      ocrAndVisionCoexistInPersistedSnapshot: true,
      foundation6ResolutionAuditReached: audits.length >= 1,
      promotedFields,
      reviewRequiredFields,
      reviewRequiredFieldsRemainUnpromoted: reviewRequiredFields.every((field) => !trace?.[field]),
      declarationLifecyclePromoted: true,
      directNormalizedWrite: false
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
