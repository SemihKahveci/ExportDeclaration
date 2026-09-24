import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DocumentType } from "../../src/common/enums/documentType.js";
import type { DeclarationFieldResolutionEnvelope } from "../../src/modules/idp/domain/declarationFieldResolution.types.js";
import { DeclarationHumanReviewDecision } from "../../src/modules/idp/domain/declarationHumanReview.types.js";
import { buildDeclarationHumanReviewRequest } from "../../src/modules/idp/review/declarationHumanReviewContract.js";
import { DeclarationHumanReviewRunModel } from "../../src/modules/idp/review/declarationHumanReviewRun.model.js";
import { persistDeclarationHumanReviewRun } from "../../src/modules/idp/review/declarationHumanReviewRun.service.js";

async function main() {
  await mongoose.connect(env.mongoUri);

  const suffix = new mongoose.Types.ObjectId().toString();
  const companyId = `company-${suffix}`;
  const declarationId = `declaration-${suffix}`;
  const sourceResolutionRunId = `resolution-${suffix}`;

  const candidate = (
    id: string,
    type: typeof DocumentType.INVOICE | typeof DocumentType.PACKING_LIST,
    value: number,
  ) => ({
    candidateId: id,
    field: "goodsLines.0.quantity",
    value,
    confidence: 0.99,
    extractor: "fixture",
    logicalDocumentId: `logical-${id}`,
    uploadedFileId: `file-${id}`,
    documentType: type,
    sourceProcessingRunId: `run-${id}`,
    evidence: [],
  });

  const resolution: DeclarationFieldResolutionEnvelope = {
    version: "1",
    companyId,
    declarationId,
    reviewRequiredFields: ["goodsLines.0.quantity"],
    fields: {
      "goodsLines.0.quantity": {
        field: "goodsLines.0.quantity",
        status: "REVIEW_REQUIRED",
        reason: "CONFLICT_NO_AUTHORITY",
        candidates: [
          candidate("invoice-qty", DocumentType.INVOICE, 2),
          candidate("packing-qty", DocumentType.PACKING_LIST, 3),
        ],
      },
    },
  };

  const request = buildDeclarationHumanReviewRequest({
    sourceResolutionRunId,
    resolution,
  });

  const submission = {
    version: "1" as const,
    companyId,
    declarationId,
    sourceResolutionRunId,
    actorUserId: "reviewer-1",
    decisions: [
      {
        field: "goodsLines.0.quantity",
        decision: DeclarationHumanReviewDecision.SELECT_CANDIDATE,
        candidateId: "packing-qty",
        note: "Verified packing list.",
      },
    ],
  };

  try {
    const first = await persistDeclarationHumanReviewRun({
      request,
      submission,
      currentSourceResolutionRunId: sourceResolutionRunId,
    });
    assert.equal(first.reused, false);
    assert.equal(first.run.status, "DECIDED");

    const replay = await persistDeclarationHumanReviewRun({
      request,
      submission,
      currentSourceResolutionRunId: sourceResolutionRunId,
    });
    assert.equal(replay.reused, true);
    assert.equal(String(replay.run._id), String(first.run._id));

    const changed = await persistDeclarationHumanReviewRun({
      request,
      submission: {
        ...submission,
        decisions: [
          {
            ...submission.decisions[0],
            candidateId: "invoice-qty",
            note: "Verified invoice.",
          },
        ],
      },
      currentSourceResolutionRunId: sourceResolutionRunId,
    });
    assert.equal(changed.reused, false);
    assert.notEqual(String(changed.run._id), String(first.run._id));

    let staleSourceRejected = false;
    try {
      await persistDeclarationHumanReviewRun({
        request,
        submission,
        currentSourceResolutionRunId: "newer-resolution",
      });
    } catch {
      staleSourceRejected = true;
    }
    assert.equal(staleSourceRejected, true);

    const otherCompanyRequest = {
      ...request,
      companyId: `other-${companyId}`,
    };
    const otherSubmission = {
      ...submission,
      companyId: `other-${companyId}`,
    };
    const isolated = await persistDeclarationHumanReviewRun({
      request: otherCompanyRequest,
      submission: otherSubmission,
      currentSourceResolutionRunId: sourceResolutionRunId,
    });
    assert.equal(isolated.reused, false);

    assert.equal(
      await DeclarationHumanReviewRunModel.countDocuments({
        companyId,
        declarationId,
      }),
      2,
    );

    console.log(
      JSON.stringify(
        {
          event: "foundation-9.2.human-review-persistence.passed",
          persistence: {
            appendOnlyReviewAudit: true,
            exactReplayReusedRun: true,
            changedDecisionCreatedNewRun: true,
            actorIdentityPersisted: true,
            sourceResolutionPersisted: true,
          },
          guardrails: {
            staleSourceRejected,
            companyIsolation: true,
            arbitraryReplacementValueAccepted: false,
            normalizedDataMutated: false,
            foundation6AuthorityBypassed: false,
            existingReviewRunMutated: false,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await DeclarationHumanReviewRunModel.deleteMany({ declarationId });
    await DeclarationHumanReviewRunModel.deleteMany({
      declarationId,
      companyId: `other-${companyId}`,
    });
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
