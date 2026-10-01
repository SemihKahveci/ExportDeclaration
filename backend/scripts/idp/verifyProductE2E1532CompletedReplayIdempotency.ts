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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function runPython(script: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(env.invoiceParserPython, [script, output], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk) => { stderr += String(chunk); });
    proc.on("error", reject);
    proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`Fixture generation failed (${code}): ${stderr}`)));
  });
}

async function waitForCompletion(runId: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = await ProcessingRunModel.findById(runId).lean();
    const job = await getIdpQueue().getJob(runId);
    assert(run, "ProcessingRun disappeared while waiting for completion");
    assert(job, "BullMQ job disappeared while waiting for completion");
    const state = await job.getState();
    if (run.status === ProcessingStatus.COMPLETED && state === "completed") return { run, job };
    await sleep(100);
  }
  throw new Error("Timed out waiting for initial COMPLETED/completed state");
}

async function main() {
  await mongoose.connect(env.mongoUri);

  const companyId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();
  const fixtureDir = path.join(env.uploadDir, ".foundation-tests");
  const pdfPath = path.join(fixtureDir, `product-e2e-1.5.32-${declarationId}.pdf`);
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
      companyId,
      declarationId,
      type: DocumentType.ATR,
      fileName: path.basename(pdfPath),
      filePath: pdfPath,
      mimeType: "application/pdf",
      size: bytes.length,
      extractionStatus: "PENDING",
      parseErrors: []
    });
    uploadedFileId = uploaded._id as mongoose.Types.ObjectId;

    const first = await enqueueDocumentProcessing({
      companyId,
      declarationId: String(declarationId),
      uploadedFileId: String(uploaded._id)
    }) as any;
    processingRunId = first._id as mongoose.Types.ObjectId;

    const initial = await waitForCompletion(String(processingRunId));
    const initialAttempt = initial.run.attempt ?? 0;
    assert(initialAttempt >= 1, "Initial worker execution must increment ProcessingRun.attempt");
    const initialBullAttempts = initial.job.attemptsMade;
    const initialDocs = await LogicalDocumentModel.find({ companyId, declarationId }).lean();
    const initialAudits = await DeclarationFieldResolutionRunModel.find({ companyId, declarationId }).lean();
    const initialDeclaration = await DeclarationModel.findById(declarationId).lean();
    const initialUploaded = await UploadedFileModel.findById(uploaded._id).lean();
    assert.equal(initialDocs.length, 1, "Initial completion must materialize exactly one logical document");

    const replayRequests = 8;
    const replays = await Promise.all(Array.from({ length: replayRequests }, () => enqueueDocumentProcessing({
      companyId,
      declarationId: String(declarationId),
      uploadedFileId: String(uploaded._id)
    }) as any));
    assert(replays.every((run: any) => String(run._id) === String(processingRunId)),
      "Every completed replay must return the original durable ProcessingRun");

    // Give any accidentally reactivated queue execution enough time to become
    // observable. A correct completed replay never calls queue.add/retry at all.
    await sleep(1_500);

    const finalRun = await ProcessingRunModel.findById(processingRunId).lean();
    const finalJob = await getIdpQueue().getJob(String(processingRunId));
    assert(finalRun, "Completed ProcessingRun disappeared after replay");
    assert(finalJob, "Completed BullMQ job disappeared after replay");
    const finalBullState = await finalJob.getState();
    const finalDocs = await LogicalDocumentModel.find({ companyId, declarationId }).lean();
    const finalAudits = await DeclarationFieldResolutionRunModel.find({ companyId, declarationId }).lean();
    const finalDeclaration = await DeclarationModel.findById(declarationId).lean();
    const finalUploaded = await UploadedFileModel.findById(uploaded._id).lean();
    const runCount = await ProcessingRunModel.countDocuments({ companyId, declarationId, uploadedFileId: uploaded._id });

    assert.equal(finalRun.status, ProcessingStatus.COMPLETED);
    assert.equal(finalBullState, "completed", "Completed replay must not reactivate the BullMQ job");
    assert.equal(finalRun.attempt, initialAttempt, "Completed replay must not execute the worker or increment attempt");
    assert.equal(finalJob.attemptsMade, initialBullAttempts, "Completed replay must not change BullMQ attemptsMade");
    assert.equal(runCount, 1, "Completed replay must not create a replacement ProcessingRun");
    assert.equal(finalDocs.length, initialDocs.length, "Completed replay must not duplicate logical documents");
    assert.equal(finalAudits.length, initialAudits.length, "Completed replay must not duplicate resolution audits");
    assert.deepEqual(finalDeclaration?.normalizedData ?? {}, initialDeclaration?.normalizedData ?? {},
      "Completed replay must not mutate normalized declaration data");
    assert.deepEqual(finalUploaded?.extractedData ?? {}, initialUploaded?.extractedData ?? {},
      "Completed replay must not mutate the persisted extraction result");

    console.log(JSON.stringify({
      event: "product-e2e-1.5.32.completed-replay-idempotency.passed",
      initialCompletion: {
        status: initial.run.status,
        bullMqState: "completed",
        processingRunAttempt: initialAttempt,
        bullMqAttemptsMade: initialBullAttempts,
        logicalDocuments: initialDocs.length,
        resolutionAuditCount: initialAudits.length
      },
      replay: {
        concurrentReplayRequests: replayRequests,
        allRequestsReturnedSameProcessingRun: true,
        finalStatus: finalRun.status,
        finalBullMqState: finalBullState,
        processingRunAttemptUnchanged: finalRun.attempt === initialAttempt,
        bullMqAttemptsUnchanged: finalJob.attemptsMade === initialBullAttempts,
        logicalDocumentsUnchanged: finalDocs.length === initialDocs.length,
        resolutionAuditsUnchanged: finalAudits.length === initialAudits.length,
        normalizedDataUnchanged: true,
        extractedDataUnchanged: true
      },
      guardrails: {
        redisBullMqTransportExercised: true,
        externalIdpWorkerServiceRequired: true,
        visionOrLlmRequiredForVerifier: false,
        replacementProcessingRunCreated: false,
        completedJobReactivated: false,
        duplicateWorkerExecutionObserved: false,
        directProcessIdpJobInvocation: false,
        directNormalizedWrite: false
      }
    }, null, 2));
  } finally {
    if (processingRunId) {
      try { await (await getIdpQueue().getJob(String(processingRunId)))?.remove(); } catch { /* best effort */ }
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
