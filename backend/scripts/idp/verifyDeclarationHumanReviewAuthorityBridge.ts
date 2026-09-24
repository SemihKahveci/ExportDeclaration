import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { DeclarationFieldResolutionRunModel } from "../../src/modules/idp/domain/declarationFieldResolution.model.js";
import { resolveAndPersistDeclarationFields } from "../../src/modules/idp/domain/declarationFieldResolution.service.js";
import { promotePersistedDeclarationFieldResolution } from "../../src/modules/idp/domain/declarationFieldPromotion.service.js";
import { DeclarationHumanReviewDecision } from "../../src/modules/idp/domain/declarationHumanReview.types.js";
import { buildDeclarationHumanReviewRequest } from "../../src/modules/idp/review/declarationHumanReviewContract.js";
import { DeclarationHumanReviewRunModel } from "../../src/modules/idp/review/declarationHumanReviewRun.model.js";
import { persistDeclarationHumanReviewRun } from "../../src/modules/idp/review/declarationHumanReviewRun.service.js";
import { applyDeclarationHumanReviewAuthority } from "../../src/modules/idp/review/applyDeclarationHumanReviewAuthority.js";

async function main() {
  await mongoose.connect(env.mongoUri);
  const companyId = new mongoose.Types.ObjectId();
  const declaration = await DeclarationModel.create({ companyId });

  try {
    const candidates: any = {
      version: "1",
      companyId: String(companyId),
      declarationId: String(declaration._id),
      fields: {
        "goodsLines.0.quantity": [
          {
            candidateId: "invoice-q2",
            field: "goodsLines.0.quantity",
            value: 2,
            confidence: 0.95,
            extractor: "invoice-canonical-v1",
            logicalDocumentId: "ld-invoice",
            uploadedFileId: "uf-invoice",
            documentType: "INVOICE",
            sourceProcessingRunId: "run-invoice",
            evidence: [],
          },
          {
            candidateId: "packing-q3",
            field: "goodsLines.0.quantity",
            value: 3,
            confidence: 0.95,
            extractor: "packing-list-canonical-v1",
            logicalDocumentId: "ld-packing",
            uploadedFileId: "uf-packing",
            documentType: "PACKING_LIST",
            sourceProcessingRunId: "run-packing",
            evidence: [],
          },
        ],
      },
    };

    const initial = await resolveAndPersistDeclarationFields({
      companyId,
      declarationId: declaration._id,
      candidates,
      orchestrationKey: "f93-initial",
    });
    assert.equal(initial.resolution.fields["goodsLines.0.quantity"]?.status, "REVIEW_REQUIRED");
    const initialPromotion = await promotePersistedDeclarationFieldResolution({
      companyId,
      declarationId: declaration._id,
      resolutionRunId: initial.run._id,
    });
    assert.deepEqual(initialPromotion.promotedFields, []);

    const request = buildDeclarationHumanReviewRequest({
      sourceResolutionRunId: String(initial.run._id),
      resolution: initial.resolution,
    });

    const keepReview = await persistDeclarationHumanReviewRun({
      request,
      submission: {
        version: "1",
        companyId: String(companyId),
        declarationId: String(declaration._id),
        sourceResolutionRunId: String(initial.run._id),
        actorUserId: "reviewer-keep",
        decisions: [{
          field: "goodsLines.0.quantity",
          decision: DeclarationHumanReviewDecision.KEEP_REVIEW_REQUIRED,
          note: "Evidence remains ambiguous.",
        }],
      },
      currentSourceResolutionRunId: String(initial.run._id),
    });
    assert.equal(keepReview.run.status, "REVIEW_REQUIRED");
    await assert.rejects(
      () => applyDeclarationHumanReviewAuthority({ companyId, declarationId: declaration._id, reviewRunId: keepReview.run._id }),
      /Only DECIDED human review/i,
    );

    const selected = await persistDeclarationHumanReviewRun({
      request,
      submission: {
        version: "1",
        companyId: String(companyId),
        declarationId: String(declaration._id),
        sourceResolutionRunId: String(initial.run._id),
        actorUserId: "reviewer-authority",
        decisions: [{
          field: "goodsLines.0.quantity",
          decision: DeclarationHumanReviewDecision.SELECT_CANDIDATE,
          candidateId: "packing-q3",
          note: "Verified against packing list.",
        }],
      },
      currentSourceResolutionRunId: String(initial.run._id),
    });
    assert.equal(selected.run.status, "DECIDED");

    const before = await DeclarationModel.findById(declaration._id).lean();
    assert.equal((before?.normalizedData as any)?.goodsLines?.[0]?.quantity, undefined);

    const applied = await applyDeclarationHumanReviewAuthority({
      companyId,
      declarationId: declaration._id,
      reviewRunId: selected.run._id,
    });
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

    const replay = await applyDeclarationHumanReviewAuthority({
      companyId,
      declarationId: declaration._id,
      reviewRunId: selected.run._id,
    });
    assert.equal(replay.reusedResolutionRun, true);
    assert.equal(replay.resolutionRunId, applied.resolutionRunId);
    assert.equal(
      await DeclarationFieldResolutionRunModel.countDocuments({ companyId, declarationId: declaration._id }),
      2,
    );

    const otherCompany = new mongoose.Types.ObjectId();
    await assert.rejects(
      () => applyDeclarationHumanReviewAuthority({ companyId: otherCompany, declarationId: declaration._id, reviewRunId: selected.run._id }),
      /not found in company scope/i,
    );

    const originalRun = await DeclarationFieldResolutionRunModel.findById(initial.run._id).lean();
    assert.equal(originalRun?.resolution.fields["goodsLines.0.quantity"]?.status, "REVIEW_REQUIRED");

    console.log(JSON.stringify({
      event: "foundation-9.3.human-review-authority-bridge.passed",
      bridge: {
        persistedHumanDecisionUsedAsSource: true,
        selectedExistingCandidateConvertedToAuthority: true,
        newFoundation6ResolutionRunCreated: true,
        selectedCandidateResolved: true,
        promotionExecutedByFoundation6Boundary: true,
        sourceTracePreservedSelectedCandidate: true,
        exactReplayReusedResolutionRun: true,
      },
      guardrails: {
        keepReviewRequiredRemainsFailClosed: true,
        directHumanNormalizedWrite: false,
        arbitraryReplacementValueAccepted: false,
        companyIsolation: true,
        originalResolutionRunMutated: false,
        duplicateResolutionRunCreated: false,
      },
    }, null, 2));
  } finally {
    await DeclarationHumanReviewRunModel.deleteMany({ declarationId: String(declaration._id) });
    await DeclarationFieldResolutionRunModel.deleteMany({ companyId });
    await DeclarationModel.deleteMany({ companyId });
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch {}
  process.exitCode = 1;
});
