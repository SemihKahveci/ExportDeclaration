import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DocumentType } from "../../src/common/enums/documentType.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { LogicalDocumentModel } from "../../src/modules/idp/domain/logicalDocument.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { DeclarationFieldResolutionRunModel } from "../../src/modules/idp/domain/declarationFieldResolution.model.js";
import { ProcessingStage, ProcessingStatus } from "../../src/modules/idp/domain/idp.types.js";
import { persistWorkerCandidateExtraction } from "../../src/modules/idp/domain/workerCandidatePersistence.js";
import { tryOrchestrateDeclarationAfterProcessing } from "../../src/modules/idp/domain/declarationFieldLifecycle.service.js";

const candidate = (id: string, field: string, value: string, pageNumber: number) => ({
  candidateId: id, field, value, confidence: .98, extractor: "verify-worker-boundary",
  evidence: [{segmentId: `seg-${pageNumber}`, pageNumber, contentSource: "NATIVE_TEXT" as const}]
});
const extraction = (id: string, value: string) => ({
  version: "1" as const, segments: [{segmentId: "seg-1", documentType: "INVOICE" as const,
    status: "EXTRACTED" as const, pageNumbers: [1], data: {fieldCandidates: {version: "1" as const,
      fields: {invoiceNo: [candidate(id, "invoiceNo", value, 1)]}}}}]
});

async function main() {
  await mongoose.connect(env.mongoUri);
  const companyId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();
  const uploadedFileId = new mongoose.Types.ObjectId();
  const staleId = new mongoose.Types.ObjectId();
  const activeId = new mongoose.Types.ObjectId();
  try {
    await DeclarationModel.create({_id: declarationId, companyId, status: "DRAFT", normalizedData: {}});
    await LogicalDocumentModel.create({companyId, declarationId, uploadedFileId, type: DocumentType.INVOICE,
      pageStart: 1, pageEnd: 1, classificationMethod: "DETERMINISTIC", sourceProcessingRunId: activeId});
    const [stale, active] = await ProcessingRunModel.insertMany([
      {_id: staleId, companyId, declarationId, uploadedFileId, status: ProcessingStatus.COMPLETED,
        currentStage: ProcessingStage.FINALIZE, attempt: 1, processorVersion: "verify-6.11"},
      {_id: activeId, companyId, declarationId, uploadedFileId, status: ProcessingStatus.PROCESSING,
        currentStage: ProcessingStage.EXTRACT_CANDIDATES, attempt: 1, processorVersion: "verify-6.11"}
    ]);
    await persistWorkerCandidateExtraction(stale, extraction("stale", "EXP-OLD"));
    await persistWorkerCandidateExtraction(active, extraction("active", "EXP-611"));
    const before = await tryOrchestrateDeclarationAfterProcessing({companyId, declarationId});
    assert.deepEqual(before, {status: "NOT_READY", reason: "PROCESSING_INCOMPLETE"});
    assert.equal(await DeclarationFieldResolutionRunModel.countDocuments({declarationId}), 0);

    const persistedRun = await ProcessingRunModel.findById(activeId).lean();
    assert(persistedRun);
    assert.equal((persistedRun.candidates as any).segments[0].data.fieldCandidates.fields.invoiceNo[0].value, "EXP-611");
    assert.equal((persistedRun.declarationCandidates as any).fields.invoiceNo[0].value, "EXP-611");
    active.status = ProcessingStatus.COMPLETED;
    active.currentStage = ProcessingStage.FINALIZE;
    active.completedAt = new Date();
    await active.save();
    const first = await tryOrchestrateDeclarationAfterProcessing({companyId, declarationId});
    assert.equal(first.status, "ORCHESTRATED");
    const retry = await tryOrchestrateDeclarationAfterProcessing({companyId, declarationId});
    assert.equal(retry.status, "ORCHESTRATED");
    if (first.status !== "ORCHESTRATED" || retry.status !== "ORCHESTRATED") throw new Error("Not orchestrated");
    assert.equal(first.resolutionRunId, retry.resolutionRunId);
    assert.equal(retry.reusedResolutionRun, true);
    assert.equal(await DeclarationFieldResolutionRunModel.countDocuments({declarationId}), 1);
    const declaration = await DeclarationModel.findById(declarationId).lean();
    assert(declaration);
    assert.equal((declaration.normalizedData as any).header.invoiceNo, "EXP-611");
    const trace = (declaration.sourceTrace as any)["header.invoiceNo"];
    assert.equal(trace.sourceProcessingRunId, String(activeId));
    assert.equal(trace.uploadedFileId, String(uploadedFileId));
    assert.notEqual((declaration.normalizedData as any).header.invoiceNo, "EXP-OLD");

    // A malformed duplicate snapshot must fail before mutating persisted run data.
    const bad = extraction("bad", "EXP-BAD");
    bad.segments.push({...bad.segments[0]});
    await assert.rejects(() => persistWorkerCandidateExtraction(active, bad), /Duplicate declaration candidate id/);
    const after = await ProcessingRunModel.findById(activeId).lean();
    assert.equal((after?.declarationCandidates as any).fields.invoiceNo[0].value, "EXP-611");
    assert.equal(await DeclarationFieldResolutionRunModel.countDocuments({declarationId}), 1);
    console.log(JSON.stringify({event: "foundation-6.11.worker-candidate-lifecycle-integration.passed",
      integration: {workerSnapshotPersisted: true, processingGated: true, activeRunPromoted: "EXP-611",
        duplicateCompletionReusedRun: true, provenancePreserved: true},
      guardrails: {staleRunExcluded: true, malformedExtractionRejectedBeforeWrite: true,
        incompleteCreatesAuditRecord: false, exactRetryCreatesDuplicateAudit: false}}, null, 2));
  } finally {
    await DeclarationFieldResolutionRunModel.deleteMany({declarationId});
    await LogicalDocumentModel.deleteMany({declarationId});
    await ProcessingRunModel.deleteMany({declarationId});
    await DeclarationModel.deleteMany({_id: declarationId});
    await mongoose.disconnect();
  }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
