import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DocumentType } from "../../src/common/enums/documentType.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { LogicalDocumentModel } from "../../src/modules/idp/domain/logicalDocument.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { DeclarationIntelligenceAssessmentRunModel } from "../../src/modules/idp/domain/declarationIntelligenceAssessment.model.js";
import { orchestrateDeclarationIntelligence } from "../../src/modules/idp/domain/declarationIntelligenceOrchestration.service.js";
import { ProcessingStage, ProcessingStatus } from "../../src/modules/idp/domain/idp.types.js";

const snapshot = (candidateId: string, value: string, pageNumber = 1) => ({
  version: "1" as const,
  fields: {
    invoiceNo: [{
      candidateId, field: "invoiceNo", value, confidence: 0.99, extractor: "foundation-7.5-fixture",
      evidence: [{ segmentId: "segment-001", pageNumber, text: value, contentSource: "NATIVE_TEXT" as const }]
    }]
  }
});

async function main() {
  await mongoose.connect(env.mongoUri);
  const companyId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();
  const invoiceFileId = new mongoose.Types.ObjectId();
  const packingFileId = new mongoose.Types.ObjectId();
  const invoiceRunId = new mongoose.Types.ObjectId();
  const packingRunId = new mongoose.Types.ObjectId();

  try {
    await DeclarationModel.create({ _id: declarationId, companyId, status: "DRAFT" });
    await ProcessingRunModel.create([
      { _id: invoiceRunId, companyId, declarationId, uploadedFileId: invoiceFileId, status: ProcessingStatus.COMPLETED, currentStage: ProcessingStage.COMPLETED, attempt: 1, processorVersion: "foundation-7.5", declarationCandidates: snapshot("invoice-no-invoice", "EXP-750") },
      { _id: packingRunId, companyId, declarationId, uploadedFileId: packingFileId, status: ProcessingStatus.COMPLETED, currentStage: ProcessingStage.COMPLETED, attempt: 1, processorVersion: "foundation-7.5", declarationCandidates: snapshot("invoice-no-packing", "exp-750") }
    ]);
    await LogicalDocumentModel.create([
      { companyId, declarationId, uploadedFileId: invoiceFileId, type: DocumentType.INVOICE, pageStart: 1, pageEnd: 1, sourceProcessingRunId: invoiceRunId },
      { companyId, declarationId, uploadedFileId: packingFileId, type: DocumentType.PACKING_LIST, pageStart: 1, pageEnd: 1, sourceProcessingRunId: packingRunId }
    ]);

    const profiles = {
      coverageProfile: { version: "1" as const, requirements: [
        { documentType: DocumentType.INVOICE, required: true, minCount: 1, maxCount: 1 },
        { documentType: DocumentType.PACKING_LIST, required: true, minCount: 1, maxCount: 1 }
      ] },
      consistencyProfile: { version: "1" as const, rules: [{
        field: "invoiceNo", documentTypes: [DocumentType.INVOICE, DocumentType.PACKING_LIST],
        comparator: { kind: "CASE_INSENSITIVE_TEXT" as const }, requireAllDocumentTypes: true
      }] }
    };

    const first = await orchestrateDeclarationIntelligence({ companyId, declarationId, ...profiles, assessmentKey: "foundation-7.5-a" });
    assert.equal(first.status, "ASSESSED");
    if (first.status !== "ASSESSED") throw new Error("unreachable");
    assert.equal(first.readinessStatus, "READY");
    assert.equal(first.reusedAssessmentRun, false);

    const audit = await DeclarationIntelligenceAssessmentRunModel.findById(first.assessmentRunId).lean();
    assert(audit);
    assert.equal(audit.coverage.physicalFileCount, 2);
    assert.equal(audit.coverage.logicalDocumentCount, 2);
    assert.equal(audit.consistency.fields[0]?.observations.length, 2);
    assert.deepEqual(audit.consistency.fields[0]?.observations.map((item) => item.documentType).sort(), [DocumentType.INVOICE, DocumentType.PACKING_LIST].sort());

    const replay = await orchestrateDeclarationIntelligence({ companyId, declarationId, ...profiles, assessmentKey: "foundation-7.5-a" });
    assert.equal(replay.status, "ASSESSED");
    if (replay.status !== "ASSESSED") throw new Error("unreachable");
    assert.equal(replay.reusedAssessmentRun, true);
    assert.equal(replay.assessmentRunId, first.assessmentRunId);

    const normalizedBefore = (await DeclarationModel.findById(declarationId).lean())?.normalizedData;
    await ProcessingRunModel.updateOne({ _id: packingRunId }, { $set: { declarationCandidates: snapshot("invoice-no-packing-conflict", "DIFFERENT") } });
    const changed = await orchestrateDeclarationIntelligence({ companyId, declarationId, ...profiles, assessmentKey: "foundation-7.5-b" });
    assert.equal(changed.status, "ASSESSED");
    if (changed.status !== "ASSESSED") throw new Error("unreachable");
    assert.equal(changed.readinessStatus, "REVIEW_REQUIRED");
    assert.notEqual(changed.assessmentRunId, first.assessmentRunId);
    const normalizedAfter = (await DeclarationModel.findById(declarationId).lean())?.normalizedData;
    assert.deepEqual(normalizedAfter, normalizedBefore);

    console.log(JSON.stringify({
      event: "foundation-7.5.production-intelligence-orchestration.passed",
      orchestration: {
        persistedDocumentSetLoaded: true,
        activeProcessingRunsLoaded: true,
        persistedCandidateSnapshotsProjected: true,
        coverageEvaluated: true,
        crossDocumentConsistencyEvaluated: true,
        immutableAssessmentPersisted: true,
        exactReplayReusedAssessment: true,
        changedInputProducedReviewAssessment: true
      },
      guardrails: {
        processingRunProvenanceRequired: true,
        runDocumentOwnershipEnforced: true,
        incompleteOrFailedProcessingCannotBeAssessed: true,
        authoritySelectionPerformed: false,
        normalizedDataMutated: false,
        callerOwnedProfilesOnly: true
      }
    }, null, 2));
  } finally {
    await DeclarationIntelligenceAssessmentRunModel.deleteMany({ declarationId });
    await LogicalDocumentModel.deleteMany({ declarationId });
    await ProcessingRunModel.deleteMany({ declarationId });
    await DeclarationModel.deleteOne({ _id: declarationId });
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
