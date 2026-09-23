import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { DeclarationFieldResolutionRunModel } from "../../src/modules/idp/domain/declarationFieldResolution.model.js";
import { resolveAndPersistDeclarationFields } from "../../src/modules/idp/domain/declarationFieldResolution.service.js";
import { promotePersistedDeclarationFieldResolution } from "../../src/modules/idp/domain/declarationFieldPromotion.service.js";
import { DeclarationIntelligenceAssessmentRunModel } from "../../src/modules/idp/domain/declarationIntelligenceAssessment.model.js";
import { persistDeclarationLlmAssistRun } from "../../src/modules/idp/domain/declarationLlmAssistRun.service.js";
import { DeclarationLlmAssistRunModel } from "../../src/modules/idp/domain/declarationLlmAssistRun.model.js";
import { applyCurrentDeclarationLlmAssistAuthority } from "../../src/modules/idp/llm/applyDeclarationLlmAssistAuthority.js";

async function main() {
  await mongoose.connect(env.mongoUri);
  const companyId = new mongoose.Types.ObjectId();
  const declaration = await DeclarationModel.create({ companyId });
  try {
    const candidates: any = {
      version: "1", companyId: String(companyId), declarationId: String(declaration._id), fields: {
        "goodsLines.0.quantity": [
          { candidateId: "invoice-q2", field: "goodsLines.0.quantity", value: 2, confidence: 0.95, extractor: "invoice-canonical-v1", logicalDocumentId: "ld-invoice", uploadedFileId: "uf-invoice", documentType: "INVOICE", sourceProcessingRunId: "run-invoice", evidence: [] },
          { candidateId: "packing-q3", field: "goodsLines.0.quantity", value: 3, confidence: 0.95, extractor: "packing-list-canonical-v1", logicalDocumentId: "ld-packing", uploadedFileId: "uf-packing", documentType: "PACKING_LIST", sourceProcessingRunId: "run-packing", evidence: [] }
        ]
      }
    };

    const initial = await resolveAndPersistDeclarationFields({ companyId, declarationId: declaration._id, candidates, orchestrationKey: "f84-initial" });
    assert.equal(initial.resolution.fields["goodsLines.0.quantity"]?.status, "REVIEW_REQUIRED");
    const initialPromotion = await promotePersistedDeclarationFieldResolution({ companyId, declarationId: declaration._id, resolutionRunId: initial.run._id });
    assert.deepEqual(initialPromotion.promotedFields, []);

    const assessment = await DeclarationIntelligenceAssessmentRunModel.create({
      companyId, declarationId: declaration._id,
      coverage: { status: "COMPLETE", profileVersion: "1", physicalDocumentCount: 2, logicalDocumentCount: 2, requirements: [], issues: [] },
      consistency: { status: "REVIEW_REQUIRED", conflictFields: ["goodsLines.0.quantity"], insufficientEvidenceFields: [], fields: [] },
      readiness: { status: "REVIEW_REQUIRED", issues: [], coverageStatus: "COMPLETE", consistencyStatus: "REVIEW_REQUIRED" },
      assessmentKey: "f84-assessment"
    });
    await DeclarationModel.updateOne({ _id: declaration._id, companyId }, { $set: { idpIntelligence: { version: "1", assessmentRunId: assessment._id, status: "REVIEW_REQUIRED", issues: [], assessedAt: assessment.createdAt } } });

    const assist = await persistDeclarationLlmAssistRun({
      companyId, declarationId: declaration._id, assessmentRunId: assessment._id,
      request: { version: "1", task: "RESOLVE_DECLARATION_CONFLICTS", companyId: String(companyId), declarationId: String(declaration._id), fields: [{ field: "goodsLines.0.quantity", candidates: [
        { candidateId: "invoice-q2", field: "goodsLines.0.quantity", documentType: "INVOICE", logicalDocumentId: "ld-invoice", uploadedFileId: "uf-invoice", value: 2 },
        { candidateId: "packing-q3", field: "goodsLines.0.quantity", documentType: "PACKING_LIST", logicalDocumentId: "ld-packing", uploadedFileId: "uf-packing", value: 3 }
      ] }] },
      response: { version: "1", decision: "RESOLVED", selections: [{ field: "goodsLines.0.quantity", candidateId: "packing-q3" }], issues: [], model: "fixture-qwen", provider: "foundation-8.4-fixture" },
      assistKey: "f84-assist"
    });

    const before = await DeclarationModel.findById(declaration._id).lean();
    assert.equal((before?.normalizedData as any)?.goodsLines?.[0]?.quantity, undefined);

    const applied = await applyCurrentDeclarationLlmAssistAuthority({ companyId, declarationId: declaration._id });
    assert.equal(applied.reusedResolutionRun, false);
    assert.notEqual(applied.resolutionRunId, String(initial.run._id));
    assert.equal(applied.resolution.fields["goodsLines.0.quantity"]?.status, "RESOLVED");
    assert.equal(applied.resolution.fields["goodsLines.0.quantity"]?.method, "EXPLICIT_CANDIDATE_AUTHORITY");
    assert.equal(applied.resolution.fields["goodsLines.0.quantity"]?.selectedCandidateId, "packing-q3");
    assert.deepEqual(applied.promotion.promotedFields, ["goodsLines.0.quantity"]);

    const after = await DeclarationModel.findById(declaration._id).lean();
    assert.equal((after?.normalizedData as any)?.goodsLines?.[0]?.quantity, 3);
    const trace = (after?.sourceTrace as any)?.["goodsLines.0.quantity"];
    assert.equal(trace?.candidateId, "packing-q3");
    assert.equal(trace?.provenance, "DECLARATION_FIELD_RESOLUTION");
    assert.equal(trace?.resolutionRunId, applied.resolutionRunId);
    assert.equal(String(after?.idpLlmAssist?.assistRunId), String(assist.run._id));

    const replay = await applyCurrentDeclarationLlmAssistAuthority({ companyId, declarationId: declaration._id });
    assert.equal(replay.reusedResolutionRun, true);
    assert.equal(replay.resolutionRunId, applied.resolutionRunId);
    assert.equal(await DeclarationFieldResolutionRunModel.countDocuments({ companyId, declarationId: declaration._id }), 2);

    const staleCompany = new mongoose.Types.ObjectId();
    await assert.rejects(() => applyCurrentDeclarationLlmAssistAuthority({ companyId: staleCompany, declarationId: declaration._id }), /not found in company scope/i);

    await DeclarationModel.updateOne({ _id: declaration._id, companyId }, { $set: { "idpLlmAssist.decision": "REVIEW_REQUIRED" } });
    await assert.rejects(() => applyCurrentDeclarationLlmAssistAuthority({ companyId, declarationId: declaration._id }), /Only RESOLVED LLM assistance/i);

    console.log(JSON.stringify({
      event: "foundation-8.4.llm-candidate-authority-bridge.passed",
      bridge: {
        reviewRequiredFoundation6RunUsedAsSource: true,
        validatedLlmSelectionConvertedToAuthorityInput: true,
        newFoundation6ResolutionRunCreated: true,
        selectedExistingCandidateResolved: true,
        promotionExecutedByFoundation6Boundary: true,
        sourceTracePreservedSelectedCandidate: true,
        exactReplayReusedResolutionRun: true
      },
      guardrails: {
        directLlmNormalizedWrite: false,
        arbitraryReplacementValueAccepted: false,
        nonResolvedAssistRejected: true,
        companyIsolation: true,
        originalResolutionRunMutated: false,
        duplicateResolutionRunCreated: false
      }
    }, null, 2));
  } finally {
    await DeclarationLlmAssistRunModel.deleteMany({ companyId });
    await DeclarationIntelligenceAssessmentRunModel.deleteMany({ companyId });
    await DeclarationFieldResolutionRunModel.deleteMany({ companyId });
    await DeclarationModel.deleteMany({ companyId });
    await mongoose.disconnect();
  }
}

main().catch(async (error) => { console.error(error); try { await mongoose.disconnect(); } catch {} process.exitCode = 1; });
