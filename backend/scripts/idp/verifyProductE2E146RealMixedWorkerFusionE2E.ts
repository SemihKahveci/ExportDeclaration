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
  assert.equal(env.llmEnabled, true, "1.4.6 requires LLM_ENABLED=true.");
  assert.equal(env.llmVisionEnabled, true, "1.4.6 requires LLM_VISION_ENABLED=true.");

  await mongoose.connect(env.mongoUri);
  const companyId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "product-e2e-1.4.6-"));
  const pdfPath = path.join(tempDir, "mixed-invoice.pdf");
  const fixtureScript = path.join(env.invoiceParserDir, "create_foundation_619_mixed_fixture.py");
  let uploadedFileId: mongoose.Types.ObjectId | undefined;
  let processingRunId: mongoose.Types.ObjectId | undefined;

  try {
    await runPython(fixtureScript, pdfPath);
    const bytes = await fs.readFile(pdfPath);
    assert.equal(bytes.subarray(0, 5).toString("ascii"), "%PDF-");

    await DeclarationModel.create({ _id: declarationId, companyId, status: "DRAFT", normalizedData: {} });
    // Mongoose materializes empty nested normalizedData containers even when the
    // caller supplies `{}`. Capture the persisted pre-worker state so the review
    // boundary can prove "no mutation" instead of incorrectly requiring zero keys.
    const declarationBeforeWorker = await DeclarationModel.findById(declarationId).lean();
    assert(declarationBeforeWorker);
    const normalizedDataBeforeWorker = declarationBeforeWorker.normalizedData;
    const sourceTraceBeforeWorker = declarationBeforeWorker.sourceTrace;
    const idpResolutionBeforeWorker = declarationBeforeWorker.idpResolution;

    const uploaded = await UploadedFileModel.create({
      companyId, declarationId, type: DocumentType.INVOICE,
      fileName: "product-e2e-1.4.6-mixed-invoice.pdf", filePath: pdfPath,
      mimeType: "application/pdf", size: bytes.length, extractionStatus: "PENDING", parseErrors: []
    });
    uploadedFileId = uploaded._id as mongoose.Types.ObjectId;

    const run = await ProcessingRunModel.create({
      companyId, declarationId, uploadedFileId,
      status: ProcessingStatus.QUEUED, currentStage: ProcessingStage.INGEST,
      attempt: 0, processorVersion: "product-e2e-1.4.6-real-mixed-worker-fusion"
    });
    processingRunId = run._id as mongoose.Types.ObjectId;

    await processIdpJob(String(run._id));

    const persistedRun = await ProcessingRunModel.findById(run._id).lean();
    assert(persistedRun);
    const workerCompleted = persistedRun.status === ProcessingStatus.COMPLETED;
    const workerReviewRequired = persistedRun.status === ProcessingStatus.REVIEW_REQUIRED;
    assert(
      workerCompleted || workerReviewRequired,
      `MIXED worker must either complete or fail closed to review; got ${persistedRun.status}`
    );

    const resolvedResult = persistedRun.resolvedResult as any;
    if (workerReviewRequired) {
      assert.equal(resolvedResult?.status, "REVIEW_REQUIRED");
      assert(
        resolvedResult?.issues?.some((issue: any) => issue?.code === "FIELD_LLM_REVIEW_REQUIRED"),
        `Unexpected MIXED review reason: ${JSON.stringify(resolvedResult?.issues ?? [])}`
      );
    }

    const canonical = persistedRun.canonicalDocument as any;
    assert.equal(canonical?.analysis?.contentKind, "MIXED");
    assert.equal(canonical?.analysis?.pageCount, 2);
    assert.equal(canonical?.analysis?.digitalPageCount, 1);
    assert.equal(canonical?.analysis?.scannedPageCount, 1);
    assert.equal(canonical?.analysis?.ocrPageCount, 1);
    assert((canonical?.analysis?.ocrWordCount ?? 0) > 0);
    assert.equal(canonical?.pages?.[0]?.contentKind, "DIGITAL");
    assert.equal(Boolean(canonical?.pages?.[0]?.ocrApplied), false, "DIGITAL page must not be OCR-enriched.");
    assert.equal(canonical?.pages?.[1]?.contentKind, "SCANNED");
    assert.equal(Boolean(canonical?.pages?.[1]?.ocrApplied), true, "SCANNED page must be OCR-enriched.");

    const docs = await LogicalDocumentModel.find({ companyId, declarationId }).lean();
    assert.equal(docs.length, 1);
    assert.equal(String(docs[0]?.uploadedFileId), String(uploaded._id));
    assert.equal(String(docs[0]?.sourceProcessingRunId), String(run._id));

    const raw = persistedRun.candidates as any;
    const invoiceSegment = raw?.segments?.find((segment: any) => segment?.documentType === "INVOICE");
    assert(invoiceSegment, "Persisted INVOICE segment missing.");
    const visionAudit = invoiceSegment.data?.visionCandidateAudit;
    assert(visionAudit, "Production MIXED worker did not persist visionCandidateAudit.");
    assert.equal(visionAudit.failedPages?.length ?? 0, 0, `Vision page failed: ${JSON.stringify(visionAudit.failedPages)}`);
    assert.equal(visionAudit.checkpoints?.length, 2, "Bounded Vision must checkpoint both pages in the MIXED invoice segment.");
    assert.deepEqual(
      visionAudit.checkpoints.map((checkpoint: any) => checkpoint.pageNumber),
      [1, 2],
      "Vision checkpoints must preserve MIXED segment page order."
    );

    const snapshot = persistedRun.declarationCandidates as any;
    const allCandidates = Object.values(snapshot?.fields ?? {}).flat() as any[];
    const nativeCandidates = allCandidates.filter((candidate) =>
      candidate?.evidence?.some((e: any) => e.contentSource === "NATIVE_TEXT"));
    const ocrCandidates = allCandidates.filter((candidate) =>
      candidate?.evidence?.some((e: any) => e.contentSource === "OCR"));
    const visionCandidates = allCandidates.filter((candidate) =>
      candidate?.evidence?.some((e: any) => e.contentSource === "PAGE_IMAGE"));
    assert(nativeCandidates.length > 0, "Native DIGITAL candidates disappeared after MIXED Vision fusion.");
    assert(visionCandidates.length > 0, "Vision inference produced no persisted PAGE_IMAGE candidates for MIXED input.");

    const nativeHs = snapshot?.fields?.["goodsLines.0.hsCode"]?.find((candidate: any) =>
      candidate?.evidence?.some((e: any) => e.contentSource === "NATIVE_TEXT"));
    assert(nativeHs, "Original DIGITAL/native HS candidate was lost during Vision fusion.");
    assert.equal(nativeHs.value, "853620100011");

    // The F6.19 fixture's scanned continuation contains shipping notes rather than
    // a second goods row. Therefore OCR candidate count is reported, not forced:
    // selective real OCR is proven by canonical page provenance above, while 1.4.5
    // already proves OCR + PAGE_IMAGE declaration-candidate coexistence.
    const audits = await DeclarationFieldResolutionRunModel.find({ companyId, declarationId }).lean();
    const declaration = await DeclarationModel.findById(declarationId).lean();

    let declarationLifecyclePromoted = false;
    let safeReviewBoundaryPreserved = false;
    if (workerCompleted) {
      assert.equal(audits.length, 1, "Completed MIXED worker must reach Foundation 6 declaration resolution.");
      const goods = (declaration?.normalizedData as any)?.goodsLines;
      assert(Array.isArray(goods));
      assert(goods.length >= 1, "Declaration lifecycle did not promote the MIXED invoice goods line.");

      const trace = declaration?.sourceTrace as any;
      assert.equal(trace?.["goodsLines.0.hsCode"]?.sourceProcessingRunId, String(run._id));
      assert.equal(trace?.["goodsLines.0.hsCode"]?.uploadedFileId, String(uploaded._id));
      assert.equal(trace?.["goodsLines.0.hsCode"]?.logicalDocumentId, String(docs[0]!._id));
      declarationLifecyclePromoted = true;
    } else {
      assert.equal(audits.length, 0, "Review-required MIXED worker must not enter Foundation 6 declaration promotion.");
      assert.deepEqual(
        declaration?.normalizedData,
        normalizedDataBeforeWorker,
        "Review-required MIXED worker must not mutate normalizedData from its persisted pre-worker state."
      );
      assert.deepEqual(
        declaration?.sourceTrace,
        sourceTraceBeforeWorker,
        "Review-required MIXED worker must not mutate declaration sourceTrace."
      );
      assert.deepEqual(
        declaration?.idpResolution,
        idpResolutionBeforeWorker,
        "Review-required MIXED worker must not create declaration idpResolution authority."
      );
      safeReviewBoundaryPreserved = true;
    }

    console.log(JSON.stringify({
      event: "product-e2e-1.4.6.real-mixed-worker-fusion-e2e.passed",
      workerOutcome: workerCompleted ? "COMPLETED" : "REVIEW_REQUIRED",
      workerCompleted,
      mixedInputConfirmed: true,
      digitalPages: canonical.analysis.digitalPageCount,
      scannedPages: canonical.analysis.scannedPageCount,
      selectivePaddleOcrInvoked: canonical.analysis.ocrPageCount === 1 && canonical.analysis.ocrWordCount > 0,
      digitalPageSkippedOcr: !canonical.pages[0].ocrApplied,
      scannedPageOcrApplied: Boolean(canonical.pages[1].ocrApplied),
      realConfiguredVisionProviderInvoked: true,
      visionPageCheckpoints: visionAudit.checkpoints.length,
      visionFailedPages: visionAudit.failedPages.length,
      nativeCandidateCount: nativeCandidates.length,
      ocrCandidateCount: ocrCandidates.length,
      visionCandidateCount: visionCandidates.length,
      nativeAndVisionCoexistInPersistedSnapshot: true,
      scannedOcrEvidencePersistedInCanonicalDocument: true,
      foundation6ResolutionAuditReached: audits.length === 1,
      declarationLifecyclePromoted,
      safeReviewBoundaryPreserved,
      reviewReason: workerReviewRequired ? "FIELD_LLM_REVIEW_REQUIRED" : null,
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
