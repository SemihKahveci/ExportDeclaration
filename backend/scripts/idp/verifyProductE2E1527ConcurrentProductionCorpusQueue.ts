import assert from "node:assert/strict";
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
import { PRODUCT_E2E_CORPUS_CASES, PRODUCT_E2E_CORPUS_ROOT } from "./productE2ECorpusGroundTruth.js";

const normText = (v: unknown) => String(v ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const normCode = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const num = (v: unknown) => typeof v === "number" ? v : Number(String(v ?? "").replace(/\s/g, "").replace(",", "."));
const eqNum = (a: unknown, b: number) => Number.isFinite(num(a)) && Math.abs(num(a) - b) <= Math.max(1e-6, Math.abs(b) * 1e-6);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const DIAGNOSTIC_CASES = new Set((process.env.PRODUCT_E2E_CONCURRENT_CASES ?? "").split(",").map((v) => v.trim()).filter(Boolean));

const FIELD_SPECS = [
  { label: "invoiceNo", field: "header.invoiceNo", read: (nd: any) => nd?.header?.invoiceNo },
  { label: "currency", field: "header.currency", read: (nd: any) => nd?.header?.currency },
  { label: "deliveryTerm", field: "trade.deliveryTerm", read: (nd: any) => nd?.trade?.deliveryTerm },
  { label: "description", field: "goodsLines.0.description", read: (nd: any) => nd?.goodsLines?.[0]?.description },
  { label: "hsCode", field: "goodsLines.0.hsCode", read: (nd: any) => nd?.goodsLines?.[0]?.hsCode },
  { label: "quantity", field: "goodsLines.0.quantity", read: (nd: any) => nd?.goodsLines?.[0]?.quantity },
  { label: "unit", field: "goodsLines.0.unit", read: (nd: any) => nd?.goodsLines?.[0]?.unit },
  { label: "unitPrice", field: "goodsLines.0.unitPrice", read: (nd: any) => nd?.goodsLines?.[0]?.unitPrice },
  { label: "lineTotal", field: "goodsLines.0.lineTotal", read: (nd: any) => nd?.goodsLines?.[0]?.lineTotal }
] as const;

function compactCandidate(candidate: any) {
  return {
    candidateId: candidate?.candidateId,
    value: candidate?.value,
    confidence: candidate?.confidence,
    extractor: candidate?.extractor,
    derived: candidate?.derived ?? false,
    sourceProcessingRunId: candidate?.sourceProcessingRunId,
    evidence: (candidate?.evidence ?? []).map((evidence: any) => ({
      contentSource: evidence?.contentSource,
      text: evidence?.text,
      pageNumber: evidence?.pageNumber,
      segmentId: evidence?.segmentId
    }))
  };
}

async function logFieldLifecycleDiagnostic(scope: Scope, nd: any, checks: boolean[]) {
  const audits = await DeclarationFieldResolutionRunModel.find({ companyId: scope.companyId, declarationId: scope.declarationId }).sort({ createdAt: -1 }).lean();
  const audit: any = audits[0];
  const candidateFields = audit?.candidateEnvelope?.fields ?? {};
  const resolutionFields = audit?.resolution?.fields ?? audit?.resolution?.fieldResolutions ?? {};
  const lifecycle = FIELD_SPECS.map((spec, index) => {
    const candidates = candidateFields?.[spec.field] ?? [];
    const resolution = resolutionFields?.[spec.field];
    return {
      label: spec.label,
      field: spec.field,
      groundTruthPassed: checks[index],
      normalizedValue: spec.read(nd),
      candidateCount: Array.isArray(candidates) ? candidates.length : 0,
      candidates: Array.isArray(candidates) ? candidates.map(compactCandidate) : [],
      resolution: resolution ? {
        status: resolution.status,
        method: resolution.method,
        value: resolution.value,
        selectedCandidateId: resolution.selectedCandidateId,
        candidateIds: resolution.candidateIds,
        conflict: resolution.conflict,
        conflictCandidateIds: resolution.conflictCandidateIds,
        selectedCandidate: resolution.selectedCandidate ? compactCandidate(resolution.selectedCandidate) : undefined
      } : null
    };
  });

  console.log(JSON.stringify({
    event: "product-e2e-1.5.27.4.field-lifecycle-diagnostic",
    id: scope.corpus.id,
    processingRunId: String(scope.processingRunId),
    failedFields: lifecycle.filter((entry) => !entry.groundTruthPassed).map((entry) => entry.field),
    lifecycle,
    auditMetadata: audit ? {
      id: String(audit._id),
      keys: Object.keys(audit).sort(),
      resolutionKeys: audit.resolution ? Object.keys(audit.resolution).sort() : [],
      promotion: audit.promotion ?? audit.promotionResult ?? audit.promotionSummary,
      promotedFields: audit.promotedFields ?? audit.resolution?.promotedFields,
      skippedReviewFields: audit.skippedReviewFields ?? audit.resolution?.skippedReviewFields
    } : null,
    measurementOnly: true,
    databaseMutation: false,
    directNormalizedWrite: false
  }, null, 2));
}

type Scope = {
  corpus: (typeof PRODUCT_E2E_CORPUS_CASES)[number];
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
  uploadedFileId?: mongoose.Types.ObjectId;
  processingRunId?: mongoose.Types.ObjectId;
};

async function waitForConcurrentCompletion(scopes: Scope[], timeoutMs = 90 * 60_000) {
  const runIds = scopes.map((scope) => String(scope.processingRunId));
  const queue = getIdpQueue();
  const deadline = Date.now() + timeoutMs;
  let maxProcessingObserved = 0;
  let maxBullMqActiveObserved = 0;
  let waitingObservedWhileAtCapacity = false;
  let simultaneousProcessingObserved = false;
  let lastProgressLogAt = 0;
  let previousSnapshot = "";

  while (Date.now() < deadline) {
    const runs = await ProcessingRunModel.find({ _id: { $in: runIds } }).lean();
    assert.equal(runs.length, scopes.length, "A concurrent ProcessingRun disappeared");
    const processing = runs.filter((run) => run.status === ProcessingStatus.PROCESSING).length;
    maxProcessingObserved = Math.max(maxProcessingObserved, processing);
    if (processing >= Math.min(2, env.idpWorkerConcurrency)) simultaneousProcessingObserved = true;

    const jobs = await Promise.all(runIds.map((id) => queue.getJob(id)));
    jobs.forEach((job, index) => assert(job, `BullMQ job missing for ${scopes[index]!.corpus.id}`));
    const states = await Promise.all(jobs.map((job) => job!.getState()));
    const active = states.filter((state) => state === "active").length;
    const waiting = states.filter((state) => state === "waiting" || state === "delayed").length;
    maxBullMqActiveObserved = Math.max(maxBullMqActiveObserved, active);
    if (active >= env.idpWorkerConcurrency && waiting > 0) waitingObservedWhileAtCapacity = true;

    const snapshot = scopes.map((scope, index) => `${scope.corpus.id}:${runs.find((run) => String(run._id) === runIds[index])?.status ?? "MISSING"}/${states[index]}`).join(" | ");
    if (snapshot !== previousSnapshot || Date.now() - lastProgressLogAt >= 60_000) {
      console.log(JSON.stringify({
        event: "product-e2e-1.5.27.concurrent-progress",
        elapsedMinutes: Number(((timeoutMs - (deadline - Date.now())) / 60_000).toFixed(1)),
        processing,
        active,
        waiting,
        jobs: snapshot
      }));
      previousSnapshot = snapshot;
      lastProgressLogAt = Date.now();
    }

    const terminalFailure = runs.find((run) => run.status === ProcessingStatus.FAILED || run.status === ProcessingStatus.REVIEW_REQUIRED);
    if (terminalFailure) throw new Error(`Concurrent production corpus run failed: ${terminalFailure._id} status=${terminalFailure.status} error=${JSON.stringify(terminalFailure.error)}`);
    if (states.some((state) => state === "failed")) throw new Error(`Concurrent BullMQ job failed: ${states.join(",")}`);

    if (runs.every((run) => run.status === ProcessingStatus.COMPLETED) && states.every((state) => state === "completed")) {
      return { maxProcessingObserved, maxBullMqActiveObserved, waitingObservedWhileAtCapacity, simultaneousProcessingObserved };
    }
    await sleep(250);
  }
  const finalRuns = await ProcessingRunModel.find({ _id: { $in: runIds } }).lean();
  const finalJobs = await Promise.all(runIds.map((id) => queue.getJob(id)));
  const finalStates = await Promise.all(finalJobs.map(async (job) => job ? job.getState() : "missing"));
  const diagnostic = scopes.map((scope, index) => ({
    id: scope.corpus.id,
    processingRunStatus: finalRuns.find((run) => String(run._id) === runIds[index])?.status ?? "MISSING",
    bullMqState: finalStates[index]
  }));
  throw new Error(`Timed out after ${Math.round(timeoutMs / 60_000)} minutes waiting for concurrent production corpus jobs: ${JSON.stringify(diagnostic)}`);
}

async function main() {
  assert.equal(PRODUCT_E2E_CORPUS_CASES.length, 4, "1.5.27 expects the fixed four-case production corpus");
  assert.equal(env.llmEnabled, true, "1.5.27 requires LLM_ENABLED=true");
  assert.equal(env.llmVisionEnabled, true, "1.5.27 requires LLM_VISION_ENABLED=true");
  assert(env.idpWorkerConcurrency >= 2, "1.5.27 requires IDP_WORKER_CONCURRENCY >= 2");
  await mongoose.connect(env.mongoUri);

  const selectedCorpus = DIAGNOSTIC_CASES.size > 0
    ? PRODUCT_E2E_CORPUS_CASES.filter((corpus) => DIAGNOSTIC_CASES.has(corpus.id))
    : PRODUCT_E2E_CORPUS_CASES;
  if (DIAGNOSTIC_CASES.size > 0) {
    assert.equal(selectedCorpus.length, DIAGNOSTIC_CASES.size, `Unknown PRODUCT_E2E_CONCURRENT_CASES entry: ${[...DIAGNOSTIC_CASES].join(",")}`);
    assert(selectedCorpus.length >= 2, "Concurrent diagnostic mode requires at least two cases");
  }

  const scopes: Scope[] = selectedCorpus.map((corpus) => ({
    corpus,
    companyId: new mongoose.Types.ObjectId(),
    declarationId: new mongoose.Types.ObjectId()
  }));

  try {
    for (const scope of scopes) {
      const pdfPath = path.join(PRODUCT_E2E_CORPUS_ROOT, scope.corpus.pdf);
      const stat = await fs.stat(pdfPath);
      await DeclarationModel.create({ _id: scope.declarationId, companyId: scope.companyId, status: "DRAFT", normalizedData: {} });
      const uploaded = await UploadedFileModel.create({
        companyId: scope.companyId,
        declarationId: scope.declarationId,
        type: DocumentType.INVOICE,
        fileName: scope.corpus.pdf,
        filePath: pdfPath,
        mimeType: "application/pdf",
        size: stat.size,
        extractionStatus: "PENDING",
        parseErrors: []
      });
      scope.uploadedFileId = uploaded._id as mongoose.Types.ObjectId;
    }

    // Intentionally enqueue all four without awaiting worker completion between them.
    const queued = await Promise.all(scopes.map((scope) => enqueueDocumentProcessing({
      companyId: scope.companyId,
      declarationId: String(scope.declarationId),
      uploadedFileId: String(scope.uploadedFileId)
    }) as any));
    queued.forEach((run, index) => { scopes[index]!.processingRunId = run._id as mongoose.Types.ObjectId; });

    const runIds = scopes.map((scope) => String(scope.processingRunId));
    assert.equal(new Set(runIds).size, scopes.length, "Concurrent corpus jobs must have distinct ProcessingRuns");
    const queue = getIdpQueue();
    const initialJobs = await Promise.all(runIds.map((id) => queue.getJob(id)));
    initialJobs.forEach((job, index) => {
      assert(job, `BullMQ job not persisted for ${scopes[index]!.corpus.id}`);
      assert.equal(job!.data.processingRunId, runIds[index]);
    });

    const concurrency = await waitForConcurrentCompletion(scopes);
    assert.equal(concurrency.simultaneousProcessingObserved, true, "No overlapping production corpus processing was observed");
    assert(concurrency.maxProcessingObserved <= env.idpWorkerConcurrency, `ProcessingRun concurrency exceeded configured worker concurrency: ${concurrency.maxProcessingObserved} > ${env.idpWorkerConcurrency}`);
    assert(concurrency.maxBullMqActiveObserved <= env.idpWorkerConcurrency, `BullMQ active jobs exceeded configured worker concurrency: ${concurrency.maxBullMqActiveObserved} > ${env.idpWorkerConcurrency}`);
    const backpressureExpected = scopes.length > env.idpWorkerConcurrency;

    const results = [];
    for (const scope of scopes) {
      const persisted = await ProcessingRunModel.findById(scope.processingRunId).lean();
      assert(persisted, `${scope.corpus.id}: ProcessingRun disappeared`);
      assert.equal(persisted.status, ProcessingStatus.COMPLETED, `${scope.corpus.id}: worker did not complete`);
      assert.equal(persisted.attempt, 1, `${scope.corpus.id}: unexpected retry`);

      const declaration = await DeclarationModel.findOne({ _id: scope.declarationId, companyId: scope.companyId }).lean();
      assert(declaration, `${scope.corpus.id}: declaration disappeared`);
      const nd: any = declaration.normalizedData ?? {};
      const first = Array.isArray(nd.goodsLines) ? nd.goodsLines[0] ?? {} : {};
      const expected = scope.corpus.expected;
      const checks = [
        normText(nd?.header?.invoiceNo) === normText(expected.invoiceNumber),
        normText(nd?.header?.currency) === normText(expected.currency),
        expected.deliveryTerm ? normText(nd?.trade?.deliveryTerm) === normText(expected.deliveryTerm) : true,
        normText(first.description).includes(normText(expected.firstGoodsLine.descriptionContains)),
        normCode(first.hsCode) === expected.firstGoodsLine.hsCode,
        eqNum(first.quantity, expected.firstGoodsLine.quantity),
        normText(first.unit) === normText(expected.firstGoodsLine.unit),
        eqNum(first.unitPrice, expected.firstGoodsLine.unitPrice),
        eqNum(first.lineTotal, expected.firstGoodsLine.lineTotal)
      ];
      if (!checks.every(Boolean)) {
        await logFieldLifecycleDiagnostic(scope, nd, checks);
        throw new assert.AssertionError({
          message: `${scope.corpus.id}: concurrent normalized result diverged from fixed corpus ground truth: ${JSON.stringify({ nd, checks })}`,
          actual: false,
          expected: true,
          operator: "=="
        });
      }

      const docs = await LogicalDocumentModel.find({ companyId: scope.companyId, declarationId: scope.declarationId }).lean();
      assert(docs.length >= 1, `${scope.corpus.id}: logical document missing`);
      assert(docs.every((doc) => String(doc.uploadedFileId) === String(scope.uploadedFileId)), `${scope.corpus.id}: logical document upload ownership crossed jobs`);
      assert(docs.every((doc) => String(doc.sourceProcessingRunId) === String(scope.processingRunId)), `${scope.corpus.id}: logical document ProcessingRun ownership crossed jobs`);

      const audits = await DeclarationFieldResolutionRunModel.find({ companyId: scope.companyId, declarationId: scope.declarationId }).lean();
      assert(audits.length >= 1, `${scope.corpus.id}: resolution audit missing`);
      for (const other of scopes.filter((candidate) => candidate !== scope)) {
        assert.equal(await LogicalDocumentModel.countDocuments({ companyId: other.companyId, declarationId: scope.declarationId }), 0, `${scope.corpus.id}: cross-company logical document leakage`);
        assert.equal(await DeclarationFieldResolutionRunModel.countDocuments({ companyId: other.companyId, declarationId: scope.declarationId }), 0, `${scope.corpus.id}: cross-company resolution leakage`);
      }

      results.push({ id: scope.corpus.id, passed: checks.filter(Boolean).length, total: checks.length, attempt: persisted.attempt });
    }

    if (backpressureExpected) {
      assert.equal(concurrency.waitingObservedWhileAtCapacity, true, "No queued/backpressured job was observed while the worker was at capacity");
    }

    const passed = results.reduce((sum, result) => sum + result.passed, 0);
    const total = results.reduce((sum, result) => sum + result.total, 0);
    assert.equal(passed, total);

    console.log(JSON.stringify({
      event: "product-e2e-1.5.27.concurrent-production-corpus-queue.passed",
      corpus: { cases: results.length, passed, total, percent: Number((100 * passed / total).toFixed(1)), results },
      concurrency: {
        configuredWorkerConcurrency: env.idpWorkerConcurrency,
        jobsEnqueuedTogether: scopes.length,
        maxProcessingObserved: concurrency.maxProcessingObserved,
        maxBullMqActiveObserved: concurrency.maxBullMqActiveObserved,
        simultaneousProcessingObserved: concurrency.simultaneousProcessingObserved,
        backpressureExpected,
        waitingObservedWhileAtCapacity: concurrency.waitingObservedWhileAtCapacity,
        allCompletedWithoutRetry: results.every((result) => result.attempt === 1)
      },
      isolation: {
        distinctCompanies: new Set(scopes.map((scope) => String(scope.companyId))).size === scopes.length,
        distinctDeclarations: new Set(scopes.map((scope) => String(scope.declarationId))).size === scopes.length,
        logicalDocumentOwnershipPreserved: true,
        processingRunOwnershipPreserved: true,
        resolutionAuditIsolationPreserved: true,
        crossTenantLeakageObserved: false
      },
      guardrails: {
        realProductionCorpus: true,
        redisBullMqTransportExercised: true,
        externalIdpWorkerServiceRequired: true,
        realConfiguredVisionProvider: true,
        directProcessIdpJobInvocation: false,
        fixedGroundTruth: true,
        customerPdfsCommitted: false,
        directNormalizedWrite: false
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
    await closeIdpQueue();
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
