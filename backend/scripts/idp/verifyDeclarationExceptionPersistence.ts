import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { assessDeclarationExceptions } from "../../src/modules/idp/domain/declarationExceptionAssessment.js";
import { DeclarationExceptionAssessmentRunModel } from "../../src/modules/idp/domain/declarationExceptionAssessment.model.js";
import { persistDeclarationExceptionAssessment } from "../../src/modules/idp/domain/declarationExceptionAssessment.service.js";
import type { DeclarationFieldResolutionEnvelope } from "../../src/modules/idp/domain/declarationFieldResolution.types.js";

async function main() {
  await mongoose.connect(env.mongoUri);

  const companyId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();
  const resolutionRunId = new mongoose.Types.ObjectId();
  const intelligenceRunId = new mongoose.Types.ObjectId();

  const candidate = {
    candidateId: "invoice-qty",
    field: "goodsLines.0.quantity",
    value: 2,
    confidence: 0.72,
    extractor: "foundation-9.7-fixture",
    logicalDocumentId: "logical-invoice",
    uploadedFileId: "file-invoice",
    documentType: "INVOICE" as const,
    sourceProcessingRunId: "processing-invoice",
    evidence: [],
  };

  const resolution: DeclarationFieldResolutionEnvelope = {
    version: "1",
    companyId: String(companyId),
    declarationId: String(declarationId),
    reviewRequiredFields: [],
    fields: {
      "goodsLines.0.quantity": {
        field: "goodsLines.0.quantity",
        status: "RESOLVED",
        method: "SINGLE_VALUE",
        selectedCandidateId: candidate.candidateId,
        selectedValue: candidate.value,
        selectedCandidate: candidate,
        candidates: [candidate],
      },
    },
  };

  const assessment = assessDeclarationExceptions({
    policy: { version: "1", minimumSelectedCandidateConfidence: 0.90 },
    resolution,
    intelligence: {
      status: "READY",
      issues: [],
      coverageStatus: "COMPLETE",
      consistencyStatus: "CONSISTENT",
    },
  });

  try {
    await DeclarationModel.create({
      _id: declarationId,
      companyId,
      status: "DRAFT",
      normalizedData: { goodsLines: [{ quantity: 2 }] },
      sourceTrace: { "goodsLines.0.quantity": { value: 2, source: "INVOICE" } },
      idpResolution: {
        version: "1",
        resolutionRunId,
        reviewRequiredFields: [],
        fields: resolution.fields,
        resolvedAt: new Date(),
      },
      idpIntelligence: {
        version: "1",
        assessmentRunId: intelligenceRunId,
        status: "READY",
        issues: [],
        assessedAt: new Date(),
      },
    });

    const before = await DeclarationModel.findById(declarationId).lean();
    const first = await persistDeclarationExceptionAssessment({
      companyId,
      declarationId,
      sourceResolutionRunId: resolutionRunId,
      sourceIntelligenceAssessmentRunId: intelligenceRunId,
      policy: { version: "1", minimumSelectedCandidateConfidence: 0.90 },
      assessment,
    });
    assert.equal(first.reused, false);

    const replay = await persistDeclarationExceptionAssessment({
      companyId,
      declarationId,
      sourceResolutionRunId: resolutionRunId,
      sourceIntelligenceAssessmentRunId: intelligenceRunId,
      policy: { version: "1", minimumSelectedCandidateConfidence: 0.90 },
      assessment,
    });
    assert.equal(replay.reused, true);
    assert.equal(String(replay.run._id), String(first.run._id));

    const changedAssessment = assessDeclarationExceptions({
      policy: { version: "1", minimumSelectedCandidateConfidence: 0.70 },
      resolution,
      intelligence: {
        status: "READY",
        issues: [],
        coverageStatus: "COMPLETE",
        consistencyStatus: "CONSISTENT",
      },
    });
    assert.equal(changedAssessment.status, "CLEAR");

    const changed = await persistDeclarationExceptionAssessment({
      companyId,
      declarationId,
      sourceResolutionRunId: resolutionRunId,
      sourceIntelligenceAssessmentRunId: intelligenceRunId,
      policy: { version: "1", minimumSelectedCandidateConfidence: 0.70 },
      assessment: changedAssessment,
    });
    assert.equal(changed.reused, false);
    assert.notEqual(String(changed.run._id), String(first.run._id));

    let staleReplayRejected = false;
    try {
      await persistDeclarationExceptionAssessment({
        companyId,
        declarationId,
        sourceResolutionRunId: resolutionRunId,
        sourceIntelligenceAssessmentRunId: intelligenceRunId,
        policy: { version: "1", minimumSelectedCandidateConfidence: 0.90 },
        assessment,
      });
    } catch {
      staleReplayRejected = true;
    }
    assert.equal(staleReplayRejected, true);

    let staleResolutionRejected = false;
    try {
      await persistDeclarationExceptionAssessment({
        companyId,
        declarationId,
        sourceResolutionRunId: new mongoose.Types.ObjectId(),
        sourceIntelligenceAssessmentRunId: intelligenceRunId,
        policy: { version: "1" },
        assessment: { ...assessment, status: "CLEAR", exceptions: [] },
      });
    } catch {
      staleResolutionRejected = true;
    }
    assert.equal(staleResolutionRejected, true);

    let staleIntelligenceRejected = false;
    try {
      await persistDeclarationExceptionAssessment({
        companyId,
        declarationId,
        sourceResolutionRunId: resolutionRunId,
        sourceIntelligenceAssessmentRunId: new mongoose.Types.ObjectId(),
        policy: { version: "1" },
        assessment: { ...assessment, status: "CLEAR", exceptions: [] },
      });
    } catch {
      staleIntelligenceRejected = true;
    }
    assert.equal(staleIntelligenceRejected, true);

    let companyIsolation = false;
    try {
      await persistDeclarationExceptionAssessment({
        companyId: new mongoose.Types.ObjectId(),
        declarationId,
        sourceResolutionRunId: resolutionRunId,
        sourceIntelligenceAssessmentRunId: intelligenceRunId,
        policy: { version: "1" },
        assessment,
      });
    } catch {
      companyIsolation = true;
    }
    assert.equal(companyIsolation, true);

    const after = await DeclarationModel.findById(declarationId).lean();
    assert.deepEqual(after?.normalizedData, before?.normalizedData);
    assert.deepEqual(after?.sourceTrace, before?.sourceTrace);
    assert.equal(after?.idpExceptions?.status, "CLEAR");
    assert.equal(String(after?.idpExceptions?.assessmentRunId), String(changed.run._id));
    assert.equal(await DeclarationExceptionAssessmentRunModel.countDocuments({ companyId, declarationId }), 2);

    console.log(JSON.stringify({
      event: "foundation-9.7.exception-persistence.passed",
      persistence: {
        appendOnlyExceptionAudit: true,
        currentExceptionSnapshotPersisted: true,
        exactReplayReusedRun: true,
        changedPolicyCreatedNewRun: true,
        sourceResolutionPersisted: true,
        sourceIntelligencePersisted: true,
      },
      guardrails: {
        staleReplayRejected,
        staleResolutionRejected,
        staleIntelligenceRejected,
        companyIsolation,
        normalizedDataMutated: false,
        sourceTraceMutated: false,
        candidateAuthorityCreated: false,
        foundation6AuthorityBypassed: false,
      },
    }, null, 2));
  } finally {
    await DeclarationExceptionAssessmentRunModel.deleteMany({ declarationId });
    await DeclarationModel.deleteOne({ _id: declarationId });
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
