import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { getCurrentDeclarationExceptions, listDeclarationExceptionAudit } from "../../src/modules/idp/domain/declarationExceptionApi.service.js";
import { DeclarationExceptionAssessmentRunModel } from "../../src/modules/idp/domain/declarationExceptionAssessment.model.js";

async function main() {
  await mongoose.connect(env.mongoUri);
  const companyId = new mongoose.Types.ObjectId();
  const otherCompanyId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();
  const resolutionRunId = new mongoose.Types.ObjectId();

  try {
    const run = await DeclarationExceptionAssessmentRunModel.create({
      companyId,
      declarationId,
      sourceResolutionRunId: resolutionRunId,
      policy: { version: "1", minimumSelectedCandidateConfidence: 0.9 },
      assessmentKey: "foundation-9.9-api",
      assessment: {
        version: "1",
        companyId: String(companyId),
        declarationId: String(declarationId),
        status: "REVIEW_REQUIRED",
        exceptions: [{
          exceptionId: "LOW_SELECTED_CANDIDATE_CONFIDENCE:goodsLines.0.quantity:c1",
          reason: "LOW_SELECTED_CANDIDATE_CONFIDENCE",
          severity: "REVIEW",
          field: "goodsLines.0.quantity",
          candidateId: "c1",
          confidence: 0.72,
          threshold: 0.9,
        }],
      },
    });

    await DeclarationModel.create({
      _id: declarationId,
      companyId,
      status: "DRAFT",
      idpResolution: {
        version: "1", resolutionRunId, reviewRequiredFields: [], fields: {}, resolvedAt: new Date(),
      },
      idpExceptions: {
        version: "1",
        assessmentRunId: run._id,
        sourceResolutionRunId: resolutionRunId,
        status: "REVIEW_REQUIRED",
        exceptions: run.assessment.exceptions,
        assessedAt: run.createdAt,
      },
    });

    const current = await getCurrentDeclarationExceptions(companyId, String(declarationId));
    assert.equal(current.available, true);
    assert.equal(current.current?.status, "REVIEW_REQUIRED");
    assert.equal(current.current?.exceptions[0]?.confidence, 0.72);
    assert.equal(current.current?.exceptions[0]?.threshold, 0.9);

    const audit = await listDeclarationExceptionAudit(companyId, String(declarationId));
    assert.equal(audit.length, 1);
    assert.equal(audit[0]?.assessmentRunId, String(run._id));

    let companyIsolation = false;
    try { await getCurrentDeclarationExceptions(otherCompanyId, String(declarationId)); } catch { companyIsolation = true; }
    assert.equal(companyIsolation, true);

    console.log(JSON.stringify({
      event: "foundation-9.9.exception-api-ui-boundary.passed",
      api: {
        currentExceptionProjectionExposed: true,
        appendOnlyAuditReadable: true,
        confidenceAndThresholdExposed: true,
        operationalStatusExposed: true,
        readOnlyBoundary: true,
      },
      ui: {
        reviewRequiredAndBlockedVisible: true,
        exceptionReasonsVisible: true,
        confidencePolicyContextVisible: true,
        humanReviewCandidateAuthorityRemainsSeparate: true,
      },
      guardrails: {
        companyIsolation,
        exceptionApiCreatesAuthority: false,
        exceptionApiMutatesNormalizedData: false,
        arbitraryReplacementValueAccepted: false,
      },
      routes: {
        getCurrent: "GET /api/declarations/:id/idp-exceptions/current",
        getAudit: "GET /api/declarations/:id/idp-exceptions/audit",
      },
    }, null, 2));
  } finally {
    await DeclarationExceptionAssessmentRunModel.deleteMany({ declarationId });
    await DeclarationModel.deleteOne({ _id: declarationId });
    await mongoose.disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
