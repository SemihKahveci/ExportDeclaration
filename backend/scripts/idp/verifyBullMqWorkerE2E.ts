import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DocumentType } from "../../src/common/enums/documentType.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { LogicalDocumentModel } from "../../src/modules/idp/domain/logicalDocument.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { DeclarationFieldResolutionRunModel } from "../../src/modules/idp/domain/declarationFieldResolution.model.js";
import { ProcessingStatus } from "../../src/modules/idp/domain/idp.types.js";
import { enqueueDocumentProcessing } from "../../src/modules/idp/queue/idpProcessing.service.js";
import { closeIdpQueue, getIdpQueue } from "../../src/modules/idp/queue/idpQueue.js";

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

async function waitForTerminalRun(runId: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let sawProcessing = false;
  while (Date.now() < deadline) {
    const run = await ProcessingRunModel.findById(runId).lean();
    assert(run, "Queued ProcessingRun disappeared");
    if (run.status === ProcessingStatus.PROCESSING) sawProcessing = true;
    if ([ProcessingStatus.COMPLETED, ProcessingStatus.FAILED, ProcessingStatus.REVIEW_REQUIRED].includes(run.status as any)) {
      return { run, sawProcessing };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for BullMQ worker. Ensure the idp-worker service is running.");
}

async function main() {
  await mongoose.connect(env.mongoUri);
  const companyId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();
  const fixtureDir = path.join(env.uploadDir, ".foundation-tests");
  const pdfPath = path.join(fixtureDir, `foundation-6.15-${declarationId}.pdf`);
  const fixtureScript = path.join(env.invoiceParserDir, "create_foundation_613_fixture.py");
  let uploadedFileId: mongoose.Types.ObjectId | undefined;
  let processingRunId: mongoose.Types.ObjectId | undefined;

  try {
    await fs.mkdir(fixtureDir, { recursive: true });
    await runPython(fixtureScript, pdfPath);
    const bytes = await fs.readFile(pdfPath);
    assert.equal(bytes.subarray(0, 5).toString("ascii"), "%PDF-");

    await DeclarationModel.create({ _id: declarationId, companyId, status: "DRAFT", normalizedData: {} });
    const uploaded = await UploadedFileModel.create({
      companyId, declarationId, type: DocumentType.INVOICE,
      fileName: path.basename(pdfPath), filePath: pdfPath,
      mimeType: "application/pdf", size: bytes.length, extractionStatus: "PENDING", parseErrors: []
    });
    uploadedFileId = uploaded._id as mongoose.Types.ObjectId;

    const queued = await enqueueDocumentProcessing({
      companyId,
      declarationId: String(declarationId),
      uploadedFileId: String(uploaded._id)
    }) as any;
    processingRunId = queued._id as mongoose.Types.ObjectId;
    assert.equal(queued.status, ProcessingStatus.QUEUED);

    const queue = getIdpQueue();
    const job = await queue.getJob(String(processingRunId));
    assert(job, "BullMQ job was not persisted");
    assert.equal(job.name, "process-document");
    assert.equal(job.data.processingRunId, String(processingRunId));

    const { run: persistedRun, sawProcessing } = await waitForTerminalRun(String(processingRunId));
    assert.equal(persistedRun.status, ProcessingStatus.COMPLETED, JSON.stringify(persistedRun.error ?? {}));
    assert((persistedRun.attempt ?? 0) >= 1);
    assert.equal((persistedRun.canonicalDocument as any)?.analysis?.contentKind, "DIGITAL");
    assert.equal((persistedRun.finalResult as any)?.extractMeta?.extractionSource, "CANONICAL_DOCUMENT");

    const finalJob = await queue.getJob(String(processingRunId));
    assert(finalJob, "Completed BullMQ job disappeared before verification");
    assert.equal(await finalJob.getState(), "completed");

    const docs = await LogicalDocumentModel.find({ companyId, declarationId }).lean();
    assert.equal(docs.length, 1);
    assert.equal(String(docs[0]?.sourceProcessingRunId), String(processingRunId));

    const audits = await DeclarationFieldResolutionRunModel.find({ companyId, declarationId }).lean();
    assert.equal(audits.length, 1);
    const declaration = await DeclarationModel.findById(declarationId).lean();
    const goodsLines = (declaration?.normalizedData as any)?.goodsLines;
    assert(Array.isArray(goodsLines));
    assert.equal(goodsLines[0]?.hsCode, "853620100011");
    assert.equal(goodsLines[0]?.productCode, "AG.TEST.1001");
    assert.equal(goodsLines[0]?.description, "TEST CIRCUIT BREAKER");

    console.log(JSON.stringify({
      event: "foundation-6.15.bullmq-worker-e2e.passed",
      queue: {
        enqueueServiceUsed: true,
        jobPersistedInRedis: true,
        jobIdMatchesProcessingRun: true,
        workerConsumedJob: true,
        workerProcessObserved: sawProcessing,
        finalJobState: "completed",
        processingRunAttempt: persistedRun.attempt
      },
      e2e: {
        realPdfAnalyzed: true,
        contentKind: "DIGITAL",
        pythonParserSource: "CANONICAL_DOCUMENT",
        logicalDocuments: docs.length,
        resolutionAuditPersisted: audits.length === 1,
        goodsLinePromotionPersisted: true
      },
      boundary: {
        directProcessIdpJobInvocation: false,
        redisBullMqTransportExercised: true,
        externalIdpWorkerServiceRequired: true,
        retryFailureInjectionCovered: false,
        concurrencyCovered: false
      }
    }, null, 2));
  } finally {
    if (processingRunId) {
      try { await (await getIdpQueue().getJob(String(processingRunId)))?.remove(); } catch { /* best-effort cleanup */ }
    }
    await DeclarationFieldResolutionRunModel.deleteMany({ declarationId });
    await LogicalDocumentModel.deleteMany({ declarationId });
    if (processingRunId) await ProcessingRunModel.deleteMany({ _id: processingRunId });
    if (uploadedFileId) await UploadedFileModel.deleteMany({ _id: uploadedFileId });
    await DeclarationModel.deleteMany({ _id: declarationId });
    await fs.rm(pdfPath, { force: true });
    await closeIdpQueue();
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
