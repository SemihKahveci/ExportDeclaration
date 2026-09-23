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

async function waitForFirstFailedAttempt(runId: string, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = await ProcessingRunModel.findById(runId).lean();
    assert(run, "Queued ProcessingRun disappeared");
    if (run.status === ProcessingStatus.FAILED && (run.attempt ?? 0) === 1) return run;
    if ((run.attempt ?? 0) > 1) throw new Error("Retry started before the first FAILED checkpoint was observed; increase IDP_JOB_BACKOFF_MS for this verification.");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for the injected first-attempt failure.");
}

async function waitForRecoveredRun(runId: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let sawSecondProcessingAttempt = false;
  while (Date.now() < deadline) {
    const run = await ProcessingRunModel.findById(runId).lean();
    assert(run, "ProcessingRun disappeared during retry");
    if (run.status === ProcessingStatus.PROCESSING && (run.attempt ?? 0) >= 2) sawSecondProcessingAttempt = true;
    if (run.status === ProcessingStatus.COMPLETED && (run.attempt ?? 0) >= 2) return { run, sawSecondProcessingAttempt };
    if (run.status === ProcessingStatus.REVIEW_REQUIRED) throw new Error("Retry reached REVIEW_REQUIRED instead of COMPLETED");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for BullMQ retry recovery.");
}


async function waitForBullMqCompleted(jobId: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  const queue = getIdpQueue();
  let lastState = "unknown";
  while (Date.now() < deadline) {
    const job = await queue.getJob(jobId);
    assert(job, "Recovered BullMQ job disappeared before verification");
    lastState = await job.getState();
    if (lastState === "completed") return job;
    if (lastState === "failed") {
      throw new Error(`Recovered BullMQ job reached failed state: ${job.failedReason ?? "unknown failure"}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for BullMQ to publish completed state after ProcessingRun completion; lastState=${lastState}`);
}

async function main() {
  await mongoose.connect(env.mongoUri);
  const companyId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();
  const fixtureDir = path.join(env.uploadDir, ".foundation-tests");
  const pdfPath = path.join(fixtureDir, `foundation-6.16-${declarationId}.pdf`);
  const fixtureScript = path.join(env.invoiceParserDir, "create_foundation_613_fixture.py");
  let uploadedFileId: mongoose.Types.ObjectId | undefined;
  let processingRunId: mongoose.Types.ObjectId | undefined;

  try {
    assert(env.idpJobAttempts >= 2, "Foundation 6.16 requires IDP_JOB_ATTEMPTS >= 2");
    assert(env.idpJobBackoffMs >= 1000, "Foundation 6.16 requires enough retry backoff to repair the injected failure deterministically");
    await fs.mkdir(fixtureDir, { recursive: true });
    await fs.rm(pdfPath, { force: true });

    await DeclarationModel.create({ _id: declarationId, companyId, status: "DRAFT", normalizedData: {} });
    const uploaded = await UploadedFileModel.create({
      companyId, declarationId, type: DocumentType.INVOICE,
      fileName: path.basename(pdfPath), filePath: pdfPath,
      mimeType: "application/pdf", size: 1, extractionStatus: "PENDING", parseErrors: []
    });
    uploadedFileId = uploaded._id as mongoose.Types.ObjectId;

    // Intentionally enqueue before the PDF exists. The external worker must fail
    // attempt 1 through the real analyzer path; no production failure hook is used.
    const queued = await enqueueDocumentProcessing({
      companyId,
      declarationId: String(declarationId),
      uploadedFileId: String(uploaded._id)
    }) as any;
    processingRunId = queued._id as mongoose.Types.ObjectId;

    const queue = getIdpQueue();
    const job = await queue.getJob(String(processingRunId));
    assert(job, "BullMQ retry job was not persisted");
    assert.equal(job.opts.attempts, env.idpJobAttempts);

    const failedAttempt = await waitForFirstFailedAttempt(String(processingRunId));
    assert.equal(failedAttempt.status, ProcessingStatus.FAILED);
    assert.equal(failedAttempt.attempt, 1);
    assert(failedAttempt.error?.message, "First attempt must persist its failure reason");

    // Repair the external input during BullMQ backoff. The same job/run must be
    // retried; creating a replacement ProcessingRun would hide retry semantics.
    await runPython(fixtureScript, pdfPath);
    const bytes = await fs.readFile(pdfPath);
    assert.equal(bytes.subarray(0, 5).toString("ascii"), "%PDF-");
    await UploadedFileModel.updateOne({ _id: uploaded._id }, { $set: { size: bytes.length } });

    const { run: recoveredRun, sawSecondProcessingAttempt } = await waitForRecoveredRun(String(processingRunId));
    assert.equal(recoveredRun.status, ProcessingStatus.COMPLETED);
    assert.equal(recoveredRun.attempt, 2, "Recovery must complete on the second attempt using the same ProcessingRun");
    assert.equal((recoveredRun.canonicalDocument as any)?.analysis?.contentKind, "DIGITAL");
    assert.equal((recoveredRun.finalResult as any)?.extractMeta?.extractionSource, "CANONICAL_DOCUMENT");
    assert.equal(recoveredRun.error, undefined, "Successful retry must clear the previous persisted error");

    // ProcessingRun is persisted as COMPLETED inside processIdpJob before the
    // BullMQ worker callback returns. There is therefore a legitimate short
    // visibility window where Mongo already says COMPLETED while Redis still
    // reports the job as active. Wait for BullMQ's own terminal publication
    // instead of treating that cross-store ordering window as a failure.
    const finalJob = await waitForBullMqCompleted(String(processingRunId));
    assert.equal(finalJob.attemptsMade, 2);

    const docs = await LogicalDocumentModel.find({ companyId, declarationId }).lean();
    assert.equal(docs.length, 1);
    assert.equal(String(docs[0]?.sourceProcessingRunId), String(processingRunId));

    const audits = await DeclarationFieldResolutionRunModel.find({ companyId, declarationId }).lean();
    assert.equal(audits.length, 1, "Retry recovery must not create duplicate declaration resolution audits");
    const declaration = await DeclarationModel.findById(declarationId).lean();
    const goodsLines = (declaration?.normalizedData as any)?.goodsLines;
    assert(Array.isArray(goodsLines));
    assert.equal(goodsLines[0]?.hsCode, "853620100011");
    assert.equal(goodsLines[0]?.productCode, "AG.TEST.1001");
    assert.equal(goodsLines[0]?.description, "TEST CIRCUIT BREAKER");

    console.log(JSON.stringify({
      event: "foundation-6.16.bullmq-retry-recovery.passed",
      retry: {
        configuredAttempts: env.idpJobAttempts,
        configuredBackoffMs: env.idpJobBackoffMs,
        firstAttemptFailed: true,
        failurePersistedOnRun: true,
        sameProcessingRunRetried: true,
        secondAttemptObservedProcessing: sawSecondProcessingAttempt,
        processingRunAttempt: recoveredRun.attempt,
        bullMqAttemptsMade: finalJob.attemptsMade,
        finalJobState: "completed",
        previousErrorCleared: recoveredRun.error == null
      },
      recovery: {
        realPdfSuppliedDuringBackoff: true,
        contentKind: "DIGITAL",
        pythonParserSource: "CANONICAL_DOCUMENT",
        logicalDocuments: docs.length,
        resolutionAuditCount: audits.length,
        goodsLinePromotionPersisted: true
      },
      guardrails: {
        productionFailureHookAdded: false,
        replacementProcessingRunCreated: false,
        duplicateResolutionAuditCreated: false,
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
