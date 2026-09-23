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

async function waitForBothRuns(runIds: string[], timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let simultaneousProcessingObserved = false;
  while (Date.now() < deadline) {
    const runs = await ProcessingRunModel.find({ _id: { $in: runIds } }).lean();
    assert.equal(runs.length, 2, "One of the concurrent ProcessingRuns disappeared");
    const byId = new Map(runs.map((run) => [String(run._id), run]));
    const ordered = runIds.map((id) => byId.get(id)!);
    if (ordered.every((run) => run.status === ProcessingStatus.PROCESSING)) simultaneousProcessingObserved = true;
    if (ordered.some((run) => run.status === ProcessingStatus.FAILED || run.status === ProcessingStatus.REVIEW_REQUIRED)) {
      throw new Error(`Concurrent worker run failed: ${JSON.stringify(ordered.map((run) => ({ id: run._id, status: run.status, error: run.error })))}`);
    }
    if (ordered.every((run) => run.status === ProcessingStatus.COMPLETED)) {
      return { runs: ordered, simultaneousProcessingObserved };
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for both concurrent BullMQ jobs to complete.");
}

async function waitForJobsCompleted(runIds: string[], timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  const queue = getIdpQueue();
  while (Date.now() < deadline) {
    const jobs = await Promise.all(runIds.map((id) => queue.getJob(id)));
    jobs.forEach((job) => assert(job, "Concurrent BullMQ job disappeared before verification"));
    const states = await Promise.all(jobs.map((job) => job!.getState()));
    if (states.every((state) => state === "completed")) return states;
    if (states.some((state) => state === "failed")) throw new Error(`Concurrent BullMQ job failed: ${states.join(",")}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for both BullMQ jobs to publish completed state.");
}

async function main() {
  await mongoose.connect(env.mongoUri);
  assert(env.idpWorkerConcurrency >= 2, "Foundation 6.17 requires IDP_WORKER_CONCURRENCY >= 2");

  const fixtureDir = path.join(env.uploadDir, ".foundation-tests");
  const fixtureScript = path.join(env.invoiceParserDir, "create_foundation_613_fixture.py");
  const scopes = [0, 1].map(() => ({
    companyId: new mongoose.Types.ObjectId(),
    declarationId: new mongoose.Types.ObjectId(),
    uploadedFileId: undefined as mongoose.Types.ObjectId | undefined,
    processingRunId: undefined as mongoose.Types.ObjectId | undefined,
    pdfPath: ""
  }));

  try {
    await fs.mkdir(fixtureDir, { recursive: true });
    for (let index = 0; index < scopes.length; index += 1) {
      const scope = scopes[index];
      scope.pdfPath = path.join(fixtureDir, `foundation-6.17-${index}-${scope.declarationId}.pdf`);
      await runPython(fixtureScript, scope.pdfPath);
      const bytes = await fs.readFile(scope.pdfPath);
      assert.equal(bytes.subarray(0, 5).toString("ascii"), "%PDF-");
      await DeclarationModel.create({ _id: scope.declarationId, companyId: scope.companyId, status: "DRAFT", normalizedData: {} });
      const uploaded = await UploadedFileModel.create({
        companyId: scope.companyId,
        declarationId: scope.declarationId,
        type: DocumentType.INVOICE,
        fileName: path.basename(scope.pdfPath),
        filePath: scope.pdfPath,
        mimeType: "application/pdf",
        size: bytes.length,
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
    queued.forEach((run, index) => { scopes[index].processingRunId = run._id as mongoose.Types.ObjectId; });
    const runIds = scopes.map((scope) => String(scope.processingRunId));
    assert.notEqual(runIds[0], runIds[1]);

    const queue = getIdpQueue();
    const jobs = await Promise.all(runIds.map((id) => queue.getJob(id)));
    jobs.forEach((job, index) => {
      assert(job, `Concurrent BullMQ job ${index} was not persisted`);
      assert.equal(job!.data.processingRunId, runIds[index]);
    });

    const { runs, simultaneousProcessingObserved } = await waitForBothRuns(runIds);
    assert.equal(simultaneousProcessingObserved, true, "Both runs never overlapped in PROCESSING; concurrency=2 was not actually observed");
    runs.forEach((run) => {
      assert.equal(run.status, ProcessingStatus.COMPLETED);
      assert.equal(run.attempt, 1);
      assert.equal((run.canonicalDocument as any)?.analysis?.contentKind, "DIGITAL");
      assert.equal((run.finalResult as any)?.extractMeta?.extractionSource, "CANONICAL_DOCUMENT");
    });
    await waitForJobsCompleted(runIds);

    for (let index = 0; index < scopes.length; index += 1) {
      const scope = scopes[index];
      const other = scopes[1 - index];
      const docs = await LogicalDocumentModel.find({ companyId: scope.companyId, declarationId: scope.declarationId }).lean();
      assert.equal(docs.length, 1);
      assert.equal(String(docs[0]?.uploadedFileId), String(scope.uploadedFileId));
      assert.equal(String(docs[0]?.sourceProcessingRunId), String(scope.processingRunId));

      const audits = await DeclarationFieldResolutionRunModel.find({ companyId: scope.companyId, declarationId: scope.declarationId }).lean();
      assert.equal(audits.length, 1);
      const declaration = await DeclarationModel.findOne({ _id: scope.declarationId, companyId: scope.companyId }).lean();
      const goodsLines = (declaration?.normalizedData as any)?.goodsLines;
      assert(Array.isArray(goodsLines));
      assert.equal(goodsLines[0]?.hsCode, "853620100011");
      assert.equal(goodsLines[0]?.productCode, "AG.TEST.1001");
      assert.equal(goodsLines[0]?.description, "TEST CIRCUIT BREAKER");

      assert.equal(await LogicalDocumentModel.countDocuments({ companyId: other.companyId, declarationId: scope.declarationId }), 0);
      assert.equal(await DeclarationFieldResolutionRunModel.countDocuments({ companyId: other.companyId, declarationId: scope.declarationId }), 0);
    }

    console.log(JSON.stringify({
      event: "foundation-6.17.bullmq-concurrency-isolation.passed",
      concurrency: {
        configuredWorkerConcurrency: env.idpWorkerConcurrency,
        jobsEnqueuedTogether: 2,
        simultaneousProcessingObserved,
        bothCompleted: true,
        attemptsPerRun: runs.map((run) => run.attempt)
      },
      isolation: {
        separateCompanies: String(scopes[0].companyId) !== String(scopes[1].companyId),
        separateDeclarations: String(scopes[0].declarationId) !== String(scopes[1].declarationId),
        logicalDocumentOwnershipPreserved: true,
        resolutionAuditIsolationPreserved: true,
        normalizedPromotionIsolationPreserved: true,
        crossTenantLeakageObserved: false
      },
      boundary: {
        directProcessIdpJobInvocation: false,
        redisBullMqTransportExercised: true,
        externalIdpWorkerServiceRequired: true,
        concurrencyCovered: true
      }
    }, null, 2));
  } finally {
    for (const scope of scopes) {
      if (scope.processingRunId) {
        try { await (await getIdpQueue().getJob(String(scope.processingRunId)))?.remove(); } catch { /* best-effort cleanup */ }
      }
    }
    const declarationIds = scopes.map((scope) => scope.declarationId);
    await DeclarationFieldResolutionRunModel.deleteMany({ declarationId: { $in: declarationIds } });
    await LogicalDocumentModel.deleteMany({ declarationId: { $in: declarationIds } });
    await ProcessingRunModel.deleteMany({ _id: { $in: scopes.map((scope) => scope.processingRunId).filter(Boolean) } });
    await UploadedFileModel.deleteMany({ _id: { $in: scopes.map((scope) => scope.uploadedFileId).filter(Boolean) } });
    await DeclarationModel.deleteMany({ _id: { $in: declarationIds } });
    await Promise.all(scopes.filter((scope) => scope.pdfPath).map((scope) => fs.rm(scope.pdfPath, { force: true })));
    await closeIdpQueue();
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
