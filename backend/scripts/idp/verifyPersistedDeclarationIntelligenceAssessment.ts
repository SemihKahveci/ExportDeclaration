import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DocumentType } from "../../src/common/enums/documentType.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { DeclarationIntelligenceAssessmentRunModel } from "../../src/modules/idp/domain/declarationIntelligenceAssessment.model.js";
import { persistDeclarationIntelligenceAssessment } from "../../src/modules/idp/domain/declarationIntelligenceAssessment.service.js";
import type { DeclarationDocumentCoverageResult } from "../../src/modules/idp/domain/declarationDocumentCoverage.types.js";
import type { DeclarationCrossDocumentConsistencyResult } from "../../src/modules/idp/domain/declarationCrossDocumentConsistency.types.js";

const coverage = (overrides: Partial<DeclarationDocumentCoverageResult> = {}): DeclarationDocumentCoverageResult => ({
  status: "COMPLETE", roles: [], missingRequiredTypes: [], excessTypes: [], unconfiguredPresentTypes: [],
  physicalFileCount: 2, logicalDocumentCount: 3, ...overrides
});
const consistency = (overrides: Partial<DeclarationCrossDocumentConsistencyResult> = {}): DeclarationCrossDocumentConsistencyResult => ({
  status: "CONSISTENT", fields: [], conflictFields: [], insufficientEvidenceFields: [], ...overrides
});

async function main() {
  await mongoose.connect(env.mongoUri);
  const companyId = new mongoose.Types.ObjectId();
  const otherCompanyId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();

  try {
    await DeclarationModel.create({ _id: declarationId, companyId, status: "DRAFT" });

    const first = await persistDeclarationIntelligenceAssessment({
      companyId, declarationId, assessmentKey: "assessment-a",
      coverage: coverage({ status: "INCOMPLETE", missingRequiredTypes: [DocumentType.PACKING_LIST] }),
      consistency: consistency({ status: "REVIEW_REQUIRED", conflictFields: ["originCountry"] })
    });
    assert.equal(first.reused, false);
    assert.equal(first.readiness.status, "REVIEW_REQUIRED");

    const persisted = await DeclarationModel.findOne({ _id: declarationId, companyId }).lean();
    assert(persisted?.idpIntelligence);
    assert.equal(String(persisted.idpIntelligence.assessmentRunId), String(first.run._id));
    assert.equal(persisted.idpIntelligence.status, "REVIEW_REQUIRED");
    assert.deepEqual(persisted.idpIntelligence.issues, first.readiness.issues);

    const audit = await DeclarationIntelligenceAssessmentRunModel.findById(first.run._id).lean();
    assert(audit);
    assert.equal(audit.coverage.missingRequiredTypes[0], DocumentType.PACKING_LIST);
    assert.equal(audit.consistency.conflictFields[0], "originCountry");

    const replay = await persistDeclarationIntelligenceAssessment({
      companyId, declarationId, assessmentKey: "assessment-a",
      coverage: coverage(), consistency: consistency()
    });
    assert.equal(replay.reused, true);
    assert.equal(String(replay.run._id), String(first.run._id));
    assert.equal(replay.readiness.status, "REVIEW_REQUIRED", "exact-key replay must reuse persisted result");

    const second = await persistDeclarationIntelligenceAssessment({
      companyId, declarationId, assessmentKey: "assessment-b",
      coverage: coverage(), consistency: consistency()
    });
    assert.equal(second.readiness.status, "READY");
    assert.notEqual(String(second.run._id), String(first.run._id));

    await assert.rejects(
      () => persistDeclarationIntelligenceAssessment({
        companyId, declarationId, assessmentKey: "assessment-a", coverage: coverage(), consistency: consistency()
      }),
      /Stale intelligence replay/
    );
    await assert.rejects(
      () => persistDeclarationIntelligenceAssessment({
        companyId: otherCompanyId, declarationId, assessmentKey: "foreign", coverage: coverage(), consistency: consistency()
      }),
      /Declaration not found in company scope/
    );

    const finalDeclaration = await DeclarationModel.findOne({ _id: declarationId, companyId }).lean();
    assert.equal(String(finalDeclaration?.idpIntelligence?.assessmentRunId), String(second.run._id));
    assert.equal(finalDeclaration?.idpIntelligence?.status, "READY");
    assert.equal(await DeclarationIntelligenceAssessmentRunModel.countDocuments({ companyId, declarationId }), 2);
    assert.equal(await DeclarationIntelligenceAssessmentRunModel.countDocuments({ companyId: otherCompanyId, declarationId }), 0);

    console.log(JSON.stringify({
      event: "foundation-7.4.persisted-intelligence-assessment.passed",
      persistence: {
        appendOnlyAuditPersisted: true,
        declarationCurrentSnapshotPersisted: true,
        coverageAndConsistencyInputsPreserved: true,
        exactKeyReplayReusedRun: true,
        changedAssessmentCreatesNewRun: true
      },
      guardrails: {
        companyIsolation: true,
        staleReplayCannotReplaceCurrentAssessment: true,
        failedScopedWriteCreatesAuditRecord: false,
        normalizedDataMutated: false,
        authoritySelectionPerformed: false
      }
    }, null, 2));
  } finally {
    await DeclarationIntelligenceAssessmentRunModel.deleteMany({ declarationId });
    await DeclarationModel.deleteOne({ _id: declarationId });
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
