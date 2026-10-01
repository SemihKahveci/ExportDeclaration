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

async function waitForTerminalFailure(runId: string, timeoutMs: number) {
  const queue = getIdpQueue();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = await ProcessingRunModel.findById(runId).lean();
    const job = await queue.getJob(runId);
    assert(run, "ProcessingRun disappeared while waiting for terminal failure");
    assert(job, "BullMQ job disappeared while waiting for terminal failure");
    const state = await job.getState();
    if (run.status === ProcessingStatus.FAILED && state === "failed") return { run, job };
    await sleep(100);
  }
  throw new Error("Timed out waiting for terminal FAILED state");
}

async function waitForRecovery(runId: string, priorAttempt: number, timeoutMs = 60_000) {
  const queue = getIdpQueue();
  const deadline = Date.now() + timeoutMs;
  let sawRequeuedState = false;
  let last = "unknown";
  while (Date.now() < deadline) {
    const run = await ProcessingRunModel.findById(runId).lean();
    const job = await queue.getJob(runId);
    assert(run, "ProcessingRun disappeared during manual recovery");
    assert(job, "BullMQ job disappeared during manual recovery");
    const state = await job.getState();
    last = `${run.status}/${state}/runAttempt=${run.attempt}/bullAttempts=${job.attemptsMade}`;
    if (["waiting", "active", "delayed"].includes(state)) sawRequeuedState = true;
    if (run.status === ProcessingStatus.COMPLETED && state === "completed") {
      return { run, job, sawRequeuedState };
    }
    await sleep(100);
  }
  throw new Error(
    `Terminal FAILED job did not recover after repairing the input and calling enqueueDocumentProcessing again. ` +
    `This indicates the durable enqueue key/BullMQ jobId boundary has no post-exhaustion recovery path. ` +
    `priorAttempt=${priorAttempt}; last=${last}`
  );
}

async function main() {
  assert(env.idpJobAttempts >= 2, "1.5.31 expects the configured BullMQ retry path to be enabled");
  await mongoose.connect(env.mongoUri);

  const companyId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();
  const fixtureDir = path.join(env.uploadDir, ".foundation-tests");
  const pdfPath = path.join(fixtureDir, `product-e2e-1.5.31-${declarationId}.pdf`);
  const fixtureScript = path.join(env.invoiceParserDir, "create_foundation_613_fixture.py");
  let uploadedFileId: mongoose.Types.ObjectId | undefined;
  let processingRunId: mongoose.Types.ObjectId | undefined;

  try {
    await fs.mkdir(fixtureDir, { recursive: true });
    await fs.rm(pdfPath, { force: true });
    await DeclarationModel.create({ _id: declarationId, companyId, status: "DRAFT", normalizedData: {} });
    const uploaded = await UploadedFileModel.create({
      companyId,
      declarationId,
      type: DocumentType.ATR,
      fileName: path.basename(pdfPath),
      filePath: pdfPath,
      mimeType: "application/pdf",
      size: 1,
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

    const terminal = await waitForTerminalFailure(
      String(processingRunId),
      Math.max(60_000, env.idpJobBackoffMs * (2 ** env.idpJobAttempts) + 45_000)
    );
    assert.equal(terminal.run.attempt, env.idpJobAttempts);
    assert.equal(terminal.job.attemptsMade, env.idpJobAttempts);

    // Simulate BullMQ removeOnFail retention expiry: Mongo keeps the durable
    // FAILED ProcessingRun, while the terminal Redis job no longer exists.
    await terminal.job.remove();
    assert.equal(await getIdpQueue().getJob(String(processingRunId)), undefined,
      "Failed BullMQ job must be absent before exercising retention-expiry recovery");

    await runPython(fixtureScript, pdfPath);
    const bytes = await fs.readFile(pdfPath);
    assert.equal(bytes.subarray(0, 5).toString("ascii"), "%PDF-");
    await UploadedFileModel.updateOne({ _id: uploaded._id }, { $set: { size: bytes.length } });

    const reenqueue = await enqueueDocumentProcessing({
      companyId,
      declarationId: String(declarationId),
      uploadedFileId: String(uploaded._id)
    }) as any;
    assert.equal(String(reenqueue._id), String(processingRunId), "Manual recovery must preserve the durable ProcessingRun identity");

    const recovered = await waitForRecovery(String(processingRunId), terminal.run.attempt ?? env.idpJobAttempts);
    assert.equal(recovered.run.status, ProcessingStatus.COMPLETED);
    assert.equal(recovered.sawRequeuedState, true, "Manual recovery never returned the terminal job to an executable BullMQ state");
    assert.equal((recovered.run.canonicalDocument as any)?.analysis?.contentKind, "DIGITAL");
    assert.equal(recovered.run.error, undefined, "Successful manual recovery must clear the previous persisted error");

    const docs = await LogicalDocumentModel.find({ companyId, declarationId }).lean();
    assert.equal(docs.length, 1, "Manual recovery must materialize exactly one logical document");
    assert.equal(String(docs[0]?.sourceProcessingRunId), String(processingRunId));
    const audits = await DeclarationFieldResolutionRunModel.find({ companyId, declarationId }).lean();
    assert(audits.length <= 1, "Manual recovery must not duplicate declaration resolution audits");

    console.log(JSON.stringify({
      event: "product-e2e-1.5.31.expired-failed-job-recovery.passed",
      terminalFailure: {
        configuredAttempts: env.idpJobAttempts,
        exhaustedBeforeRepair: true,
        processingRunAttempt: terminal.run.attempt,
        bullMqAttemptsMade: terminal.job.attemptsMade
      },
      recovery: {
        inputRepairedAfterTerminalFailure: true,
        failedBullMqJobRemovedBeforeReenqueue: true,
        enqueueApiReused: true,
        sameProcessingRun: true,
        terminalJobReactivated: recovered.sawRequeuedState,
        finalStatus: recovered.run.status,
        finalBullMqState: "completed",
        previousErrorCleared: recovered.run.error == null,
        logicalDocuments: docs.length,
        resolutionAuditCount: audits.length
      },
      guardrails: {
        redisBullMqTransportExercised: true,
        externalIdpWorkerServiceRequired: true,
        productionFailureHookAdded: false,
        visionOrLlmRequiredForVerifier: false,
        replacementProcessingRunCreated: false,
        sameDurableJobIdRecreatedAfterRetentionExpiry: true,
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
