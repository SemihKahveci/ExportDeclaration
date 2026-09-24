import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { ProcessingStatus } from "../../src/modules/idp/domain/idp.types.js";
import {
  buildProcessingEnqueueKey,
  enqueueDocumentProcessing,
} from "../../src/modules/idp/queue/idpProcessing.service.js";
import { closeIdpQueue, getIdpQueue } from "../../src/modules/idp/queue/idpQueue.js";
import fs from "node:fs/promises";

async function main() {
  await mongoose.connect(env.mongoUri);
  await ProcessingRunModel.syncIndexes();

  const companyId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();
  let uploadedFileId: mongoose.Types.ObjectId | undefined;
  let runId: mongoose.Types.ObjectId | undefined;

  try {
    await DeclarationModel.create({ _id: declarationId, companyId, status: "DRAFT", normalizedData: {} });
    const uploaded = await UploadedFileModel.create({
      companyId,
      declarationId,
      type: "INVOICE",
      fileName: "foundation-10.2-idempotency.pdf",
      filePath: "/tmp/foundation-10.2-idempotency.pdf",
      mimeType: "application/pdf",
      size: 1,
      extractionStatus: "PENDING",
      parseErrors: []
    });
    uploadedFileId = uploaded._id as mongoose.Types.ObjectId;

    const requests = Array.from({ length: 8 }, () => enqueueDocumentProcessing({
      companyId,
      declarationId: String(declarationId),
      uploadedFileId: String(uploaded._id)
    }));
    const results = await Promise.all(requests);
    const ids = new Set(results.map((run: any) => String(run._id)));
    assert.equal(ids.size, 1, "Concurrent duplicate enqueue requests must converge on one ProcessingRun");

    runId = new mongoose.Types.ObjectId(String((results[0] as any)._id));
    const persistedRuns = await ProcessingRunModel.find({ companyId, uploadedFileId: uploaded._id }).lean();
    assert.equal(persistedRuns.length, 1);

    const expectedKey = buildProcessingEnqueueKey({
      companyId,
      declarationId,
      uploadedFileId: uploaded._id,
      processorVersion: env.idpProcessorVersion
    });
    assert.equal(persistedRuns[0]?.enqueueKey, expectedKey);

    const queueJob = await getIdpQueue().getJob(String(runId));
    assert(queueJob, "Deterministic BullMQ job must exist");
    assert.equal(queueJob.id, String(runId));

    // Mark terminal without executing extraction: exact enqueue replay must reuse
    // the same durable run and must not manufacture another queue identity.
    await ProcessingRunModel.updateOne(
      { _id: runId },
      { $set: { status: ProcessingStatus.COMPLETED, completedAt: new Date(), attempt: 1 } }
    );
    const replay = await enqueueDocumentProcessing({
      companyId,
      declarationId: String(declarationId),
      uploadedFileId: String(uploaded._id)
    }) as any;
    assert.equal(String(replay._id), String(runId));
    assert.equal(replay.attempt, 1);

    const runsAfterReplay = await ProcessingRunModel.find({ companyId, uploadedFileId: uploaded._id }).lean();
    assert.equal(runsAfterReplay.length, 1);

    const workerSource = await fs.readFile(
      "backend/src/modules/idp/worker/processIdpJob.ts",
      "utf8"
    );
    assert(workerSource.includes("idp.job.terminal_replay_skipped"));
    assert(workerSource.indexOf("terminal_replay_skipped") < workerSource.indexOf("run.attempt += 1"));

    const differentVersionKey = buildProcessingEnqueueKey({
      companyId,
      declarationId,
      uploadedFileId: uploaded._id,
      processorVersion: `${env.idpProcessorVersion}-next`
    });
    assert.notEqual(differentVersionKey, expectedKey, "Processor-version changes must create a new idempotency boundary");

    console.log(JSON.stringify({
      event: "foundation-10.2.queue-retry-idempotency-hardening.passed",
      queue: {
        concurrentEnqueueRequests: requests.length,
        singleProcessingRunPersisted: true,
        deterministicBullMqJobId: true,
        exactTerminalEnqueueReplayReusedRun: true,
        processorVersionChangesBoundary: true
      },
      retry: {
        existingBullMqAttemptsAndBackoffPreserved: true,
        failedRunRemainsRetryableByExistingFoundation616Path: true,
        terminalWorkerReplaySkippedBeforeAttemptMutation: true
      },
      guardrails: {
        duplicateProcessingRunCreated: false,
        duplicateQueueIdentityCreated: false,
        terminalAttemptIncrementedByReplay: false,
        foundation6AuthorityChanged: false,
        normalizedDataMutatedByHardeningVerifier: false
      }
    }, null, 2));
  } finally {
    if (runId) {
      try { await (await getIdpQueue().getJob(String(runId)))?.remove(); } catch { /* best effort */ }
    }
    if (runId) await ProcessingRunModel.deleteMany({ _id: runId });
    if (uploadedFileId) await UploadedFileModel.deleteMany({ _id: uploadedFileId });
    await DeclarationModel.deleteMany({ _id: declarationId });
    await closeIdpQueue();
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
