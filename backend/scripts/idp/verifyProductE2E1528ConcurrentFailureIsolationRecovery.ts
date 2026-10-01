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

type Scope = {
  kind: "healthy" | "failing";
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
  uploadedFileId?: mongoose.Types.ObjectId;
  processingRunId?: mongoose.Types.ObjectId;
  filePath: string;
};

async function waitForTerminal(scopes: Scope[], timeoutMs: number) {
  const queue = getIdpQueue();
  const deadline = Date.now() + timeoutMs;
  let healthyCompletedWhileFailureNonTerminal = false;
  let overlapObserved = false;
  let previousSnapshot = "";

  while (Date.now() < deadline) {
    const snapshots = await Promise.all(scopes.map(async (scope) => {
      const run = await ProcessingRunModel.findById(scope.processingRunId).lean();
      const job = await queue.getJob(String(scope.processingRunId));
      assert(run, `${scope.kind}: ProcessingRun disappeared`);
      assert(job, `${scope.kind}: BullMQ job disappeared`);
      return { scope, run, state: await job.getState(), attemptsMade: job.attemptsMade };
    }));

    const healthy = snapshots.find((entry) => entry.scope.kind === "healthy")!;
    const failing = snapshots.find((entry) => entry.scope.kind === "failing")!;
    const processingCount = snapshots.filter((entry) => entry.run.status === ProcessingStatus.PROCESSING).length;
    if (processingCount >= 2) overlapObserved = true;
    if (healthy.run.status === ProcessingStatus.COMPLETED && failing.state !== "failed") {
      healthyCompletedWhileFailureNonTerminal = true;
    }

    const snapshot = snapshots.map((entry) => `${entry.scope.kind}:${entry.run.status}/${entry.state}/attempt=${entry.run.attempt}`).join(" | ");
    if (snapshot !== previousSnapshot) {
      console.log(JSON.stringify({ event: "product-e2e-1.5.28.failure-isolation-progress", jobs: snapshot }));
      previousSnapshot = snapshot;
    }

    if (
      healthy.run.status === ProcessingStatus.COMPLETED && healthy.state === "completed" &&
      failing.run.status === ProcessingStatus.FAILED && failing.state === "failed"
    ) {
      return { healthy, failing, healthyCompletedWhileFailureNonTerminal, overlapObserved };
    }
    await sleep(100);
  }
  throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s waiting for failure-isolation terminal states`);
}

async function main() {
  assert(env.idpWorkerConcurrency >= 2, "1.5.28 requires IDP_WORKER_CONCURRENCY >= 2");
  assert(env.idpJobAttempts >= 2, "1.5.28 expects the configured BullMQ retry path to be enabled");
  await mongoose.connect(env.mongoUri);

  const fixtureDir = path.join(env.uploadDir, ".foundation-tests");
  const fixtureScript = path.join(env.invoiceParserDir, "create_foundation_613_fixture.py");
  await fs.mkdir(fixtureDir, { recursive: true });

  const healthy: Scope = {
    kind: "healthy",
    companyId: new mongoose.Types.ObjectId(),
    declarationId: new mongoose.Types.ObjectId(),
    filePath: path.join(fixtureDir, `product-e2e-1.5.28-healthy-${new mongoose.Types.ObjectId()}.pdf`)
  };
  const failing: Scope = {
    kind: "failing",
    companyId: new mongoose.Types.ObjectId(),
    declarationId: new mongoose.Types.ObjectId(),
    filePath: path.join(fixtureDir, `product-e2e-1.5.28-missing-${new mongoose.Types.ObjectId()}.pdf`)
  };
  const scopes = [healthy, failing];

  try {
    await runPython(fixtureScript, healthy.filePath);
    const healthyBytes = await fs.readFile(healthy.filePath);
    assert.equal(healthyBytes.subarray(0, 5).toString("ascii"), "%PDF-");
    await fs.rm(failing.filePath, { force: true });

    for (const scope of scopes) {
      await DeclarationModel.create({ _id: scope.declarationId, companyId: scope.companyId, status: "DRAFT", normalizedData: {} });
      const uploaded = await UploadedFileModel.create({
        companyId: scope.companyId,
        declarationId: scope.declarationId,
        // Non-INVOICE is deliberate: this checkpoint exercises worker/queue failure
        // isolation without spending a Vision/LLM call on the healthy control job.
        type: DocumentType.ATR,
        fileName: path.basename(scope.filePath),
        filePath: scope.filePath,
        mimeType: "application/pdf",
        size: scope.kind === "healthy" ? healthyBytes.length : 1,
        extractionStatus: "PENDING",
        parseErrors: []
      });
      scope.uploadedFileId = uploaded._id as mongoose.Types.ObjectId;
    }

    const queued = await Promise.all(scopes.map((scope) => enqueueDocumentProcessing({
      companyId: scope.companyId,
      declarationId: String(scope.declarationId),
      uploadedFileId: String(scope.uploadedFileId)
    }) as any));
    queued.forEach((run, index) => { scopes[index]!.processingRunId = run._id as mongoose.Types.ObjectId; });

    const { healthy: healthyTerminal, failing: failingTerminal, healthyCompletedWhileFailureNonTerminal, overlapObserved } =
      await waitForTerminal(scopes, Math.max(60_000, env.idpJobBackoffMs * (2 ** env.idpJobAttempts) + 45_000));

    assert.equal(healthyTerminal.run.status, ProcessingStatus.COMPLETED);
    assert.equal(healthyTerminal.run.attempt, 1, "Healthy job must complete without retry");
    assert.equal(healthyTerminal.state, "completed");
    assert.equal((healthyTerminal.run.canonicalDocument as any)?.analysis?.contentKind, "DIGITAL");

    assert.equal(failingTerminal.run.status, ProcessingStatus.FAILED);
    assert.equal(failingTerminal.run.attempt, env.idpJobAttempts, "Failing run must reflect every configured BullMQ attempt");
    assert.equal(failingTerminal.state, "failed");
    assert.match(String((failingTerminal.run.error as any)?.message ?? ""), /ENOENT|no such file|cannot find/i);
    assert.equal(failingTerminal.attemptsMade, env.idpJobAttempts);

    assert.equal(healthyCompletedWhileFailureNonTerminal, true, "Healthy job did not make independent progress while failing peer retried");

    const healthyDocs = await LogicalDocumentModel.find({ companyId: healthy.companyId, declarationId: healthy.declarationId }).lean();
    assert(healthyDocs.length >= 1, "Healthy job did not materialize its logical document");
    assert(healthyDocs.every((doc) => String(doc.uploadedFileId) === String(healthy.uploadedFileId)));
    assert(healthyDocs.every((doc) => String(doc.sourceProcessingRunId) === String(healthy.processingRunId)));

    assert.equal(await LogicalDocumentModel.countDocuments({ companyId: failing.companyId, declarationId: healthy.declarationId }), 0);
    assert.equal(await LogicalDocumentModel.countDocuments({ companyId: healthy.companyId, declarationId: failing.declarationId }), 0);
    assert.equal(await DeclarationFieldResolutionRunModel.countDocuments({ companyId: failing.companyId, declarationId: healthy.declarationId }), 0);
    assert.equal(await DeclarationFieldResolutionRunModel.countDocuments({ companyId: healthy.companyId, declarationId: failing.declarationId }), 0);

    const healthyDeclaration = await DeclarationModel.findById(healthy.declarationId).lean();
    const failingDeclaration = await DeclarationModel.findById(failing.declarationId).lean();
    assert(healthyDeclaration && failingDeclaration);

    const failingNormalizedData = (failingDeclaration.normalizedData ?? {}) as Record<string, unknown>;
    const hasMeaningfulNormalizedPromotion = Object.entries(failingNormalizedData).some(([key, value]) => {
      if (key === "goodsLines" && Array.isArray(value) && value.length === 0) return false;
      if (value === undefined || value === null || value === "") return false;
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
      return true;
    });
    assert.equal(
      hasMeaningfulNormalizedPromotion,
      false,
      `Failed job must not partially promote meaningful normalized data: ${JSON.stringify(failingNormalizedData)}`
    );

    console.log(JSON.stringify({
      event: "product-e2e-1.5.28.concurrent-failure-isolation-recovery.passed",
      queue: {
        configuredWorkerConcurrency: env.idpWorkerConcurrency,
        configuredJobAttempts: env.idpJobAttempts,
        jobsEnqueuedTogether: 2,
        overlapObserved,
        healthyCompletedWhileFailureRetried: healthyCompletedWhileFailureNonTerminal,
        queueDrainedToTerminalStates: true
      },
      healthyJob: {
        status: healthyTerminal.run.status,
        bullMqState: healthyTerminal.state,
        attempt: healthyTerminal.run.attempt,
        logicalDocumentMaterialized: true
      },
      failingJob: {
        status: failingTerminal.run.status,
        bullMqState: failingTerminal.state,
        attempts: failingTerminal.run.attempt,
        deterministicPreVisionFailure: true,
        partialNormalizedPromotionObserved: false
      },
      isolation: {
        distinctCompanies: String(healthy.companyId) !== String(failing.companyId),
        distinctDeclarations: String(healthy.declarationId) !== String(failing.declarationId),
        healthyProgressIndependentOfFailure: true,
        logicalDocumentOwnershipPreserved: true,
        crossTenantLeakageObserved: false
      },
      guardrails: {
        redisBullMqTransportExercised: true,
        externalIdpWorkerServiceRequired: true,
        directProcessIdpJobInvocation: false,
        productionFailureHookAdded: false,
        visionOrLlmRequiredForVerifier: false,
        foundation6AuthorityChanged: false,
        directNormalizedWrite: false
      }
    }, null, 2));
  } finally {
    for (const scope of scopes) {
      if (scope.processingRunId) {
        try { await (await getIdpQueue().getJob(String(scope.processingRunId)))?.remove(); } catch { /* best effort */ }
      }
    }
    const declarationIds = scopes.map((scope) => scope.declarationId);
    await DeclarationFieldResolutionRunModel.deleteMany({ declarationId: { $in: declarationIds } });
    await LogicalDocumentModel.deleteMany({ declarationId: { $in: declarationIds } });
    await ProcessingRunModel.deleteMany({ _id: { $in: scopes.map((scope) => scope.processingRunId).filter(Boolean) } });
    await UploadedFileModel.deleteMany({ _id: { $in: scopes.map((scope) => scope.uploadedFileId).filter(Boolean) } });
    await DeclarationModel.deleteMany({ _id: { $in: declarationIds } });
    await Promise.all(scopes.map((scope) => fs.rm(scope.filePath, { force: true })));
    await closeIdpQueue();
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
