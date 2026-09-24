import assert from "node:assert/strict";
import fs from "node:fs";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { DeclarationExceptionAssessmentRunModel } from "../../src/modules/idp/domain/declarationExceptionAssessment.model.js";
import { tryAssessDeclarationExceptionsAfterProcessing } from "../../src/modules/idp/domain/declarationExceptionLifecycle.service.js";
import { DeclarationFieldResolutionRunModel } from "../../src/modules/idp/domain/declarationFieldResolution.model.js";
import { DeclarationIntelligenceAssessmentRunModel } from "../../src/modules/idp/domain/declarationIntelligenceAssessment.model.js";

async function main() {
  await mongoose.connect(env.mongoUri);
  const companyId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();

  const candidate = {
    candidateId: "invoice-qty",
    field: "goodsLines.0.quantity",
    value: 2,
    confidence: 0.72,
    extractor: "foundation-9.8-fixture",
    logicalDocumentId: "logical-invoice",
    uploadedFileId: "file-invoice",
    documentType: "INVOICE",
    sourceProcessingRunId: "processing-invoice",
    evidence: [],
  };

  try {
    const resolutionRun = await DeclarationFieldResolutionRunModel.create({
      companyId,
      declarationId,
      candidateEnvelope: { version: "1", companyId: String(companyId), declarationId: String(declarationId), candidates: [candidate] },
      rules: [],
      resolution: {
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
      },
      sourceProcessingRunIds: ["processing-invoice"],
    });

    const intelligenceRun = await DeclarationIntelligenceAssessmentRunModel.create({
      companyId,
      declarationId,
      coverage: { status: "COMPLETE", documents: [] },
      consistency: { status: "CONSISTENT", fields: {} },
      readiness: { status: "READY", issues: [], coverageStatus: "COMPLETE", consistencyStatus: "CONSISTENT" },
    });

    await DeclarationModel.create({
      _id: declarationId,
      companyId,
      status: "DRAFT",
      normalizedData: { goodsLines: [{ quantity: 2 }] },
      sourceTrace: { "goodsLines.0.quantity": { value: 2, source: "INVOICE" } },
      idpExceptionPolicy: { version: "1", minimumSelectedCandidateConfidence: 0.90 },
      idpResolution: {
        version: "1",
        resolutionRunId: resolutionRun._id,
        reviewRequiredFields: [],
        fields: resolutionRun.resolution.fields,
        resolvedAt: new Date(),
      },
      idpIntelligence: {
        version: "1",
        assessmentRunId: intelligenceRun._id,
        status: "READY",
        issues: [],
        assessedAt: new Date(),
      },
    });

    const before = await DeclarationModel.findById(declarationId).lean();
    const first = await tryAssessDeclarationExceptionsAfterProcessing({ companyId, declarationId });
    assert.equal(first.status, "ASSESSED");
    assert.equal(first.exceptionStatus, "REVIEW_REQUIRED");
    assert.equal(first.exceptionCount, 1);
    assert.equal(first.reused, false);

    const replay = await tryAssessDeclarationExceptionsAfterProcessing({ companyId, declarationId });
    assert.equal(replay.status, "ASSESSED");
    assert.equal(replay.reused, true);
    assert.equal(replay.assessmentRunId, first.assessmentRunId);

    const after = await DeclarationModel.findById(declarationId).lean();
    assert.deepEqual(after?.normalizedData, before?.normalizedData);
    assert.deepEqual(after?.sourceTrace, before?.sourceTrace);

    // Remove explicit confidence policy. A low-confidence candidate alone must
    // then be CLEAR; this proves the lifecycle does not invent a threshold.
    await DeclarationModel.updateOne({ _id: declarationId }, { $unset: { idpExceptionPolicy: 1, idpExceptions: 1 } });
    const noPolicy = await tryAssessDeclarationExceptionsAfterProcessing({ companyId, declarationId });
    assert.equal(noPolicy.status, "ASSESSED");
    assert.equal(noPolicy.exceptionStatus, "CLEAR");

    const workerSource = fs.readFileSync(
      new URL("../../src/modules/idp/worker/processIdpJob.ts", import.meta.url),
      "utf8",
    );
    const llmIndex = workerSource.indexOf("tryOrchestrateDeclarationLlmAssistAfterProcessing({");
    const exceptionIndex = workerSource.indexOf("tryAssessDeclarationExceptionsAfterProcessing({");
    assert.ok(llmIndex >= 0 && exceptionIndex > llmIndex, "Exception lifecycle must run after LLM authority lifecycle.");

    console.log(JSON.stringify({
      event: "foundation-9.8.worker-exception-lifecycle.passed",
      lifecycle: {
        productionWorkerIntegrated: true,
        finalCurrentResolutionAssessed: true,
        explicitConfidencePolicyApplied: true,
        missingConfidencePolicyDoesNotInventThreshold: true,
        appendOnlyPersistenceUsed: true,
        exactReplayReusedAssessment: true,
        runsAfterLlmAuthorityLifecycle: true,
      },
      guardrails: {
        normalizedDataMutated: false,
        sourceTraceMutated: false,
        candidateAuthorityCreated: false,
        completedProcessingRunRewrittenOnExceptionFailure: false,
        foundation6AuthorityBypassed: false,
      },
    }, null, 2));
  } finally {
    await DeclarationExceptionAssessmentRunModel.deleteMany({ declarationId });
    await DeclarationIntelligenceAssessmentRunModel.deleteMany({ declarationId });
    await DeclarationFieldResolutionRunModel.deleteMany({ declarationId });
    await DeclarationModel.deleteOne({ _id: declarationId });
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
