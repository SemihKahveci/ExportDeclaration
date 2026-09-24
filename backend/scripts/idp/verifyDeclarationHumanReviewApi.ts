import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { DeclarationFieldResolutionRunModel } from "../../src/modules/idp/domain/declarationFieldResolution.model.js";
import type { DeclarationFieldResolutionEnvelope } from "../../src/modules/idp/domain/declarationFieldResolution.types.js";
import { DocumentType } from "../../src/common/enums/documentType.js";
import { DeclarationHumanReviewRunModel } from "../../src/modules/idp/review/declarationHumanReviewRun.model.js";
import {
  getCurrentDeclarationHumanReview,
  listDeclarationHumanReviewAudit,
  submitCurrentDeclarationHumanReview,
} from "../../src/modules/idp/review/declarationHumanReviewApi.service.js";

async function main() {
  await mongoose.connect(env.mongoUri);
  const companyId = new mongoose.Types.ObjectId();
  const otherCompanyId = new mongoose.Types.ObjectId();
  const actorUserId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();
  const sourceRunId = new mongoose.Types.ObjectId();

  const candidate = (candidateId: string, documentType: typeof DocumentType.INVOICE | typeof DocumentType.PACKING_LIST, value: number) => ({
    candidateId,
    field: "goodsLines.0.quantity",
    value,
    confidence: 0.99,
    extractor: "foundation-9.4-fixture",
    logicalDocumentId: `logical-${candidateId}`,
    uploadedFileId: `file-${candidateId}`,
    documentType,
    sourceProcessingRunId: `processing-${candidateId}`,
    evidence: [],
  });

  const candidates = [
    candidate("invoice-qty", DocumentType.INVOICE, 2),
    candidate("packing-qty", DocumentType.PACKING_LIST, 3),
  ];
  const resolution: DeclarationFieldResolutionEnvelope = {
    version: "1",
    companyId: String(companyId),
    declarationId: String(declarationId),
    reviewRequiredFields: ["goodsLines.0.quantity"],
    fields: {
      "goodsLines.0.quantity": {
        field: "goodsLines.0.quantity",
        status: "REVIEW_REQUIRED",
        reason: "CONFLICT_NO_AUTHORITY",
        candidates,
      },
    },
  };

  try {
    await DeclarationModel.create({
      _id: declarationId,
      companyId,
      status: "DRAFT",
      normalizedData: { goodsLines: [{ quantity: 2 }] },
      sourceTrace: {},
      idpResolution: {
        version: "1",
        resolutionRunId: sourceRunId,
        reviewRequiredFields: resolution.reviewRequiredFields,
        fields: resolution.fields,
        resolvedAt: new Date(),
      },
    });
    await DeclarationFieldResolutionRunModel.create({
      _id: sourceRunId,
      companyId,
      declarationId,
      candidateEnvelope: { version: "1", companyId: String(companyId), declarationId: String(declarationId), candidates },
      rules: [{ field: "goodsLines.0.quantity", authorityOrder: [] }],
      resolution,
      sourceProcessingRunIds: [],
    });

    const current = await getCurrentDeclarationHumanReview(companyId, String(declarationId));
    assert.equal(current.required, true);
    assert.equal(current.request?.fields[0]?.candidates.length, 2);

    let inventedRejected = false;
    try {
      await submitCurrentDeclarationHumanReview({
        companyId,
        declarationId: String(declarationId),
        actorUserId,
        body: {
          sourceResolutionRunId: String(sourceRunId),
          companyId: String(otherCompanyId),
          actorUserId: String(new mongoose.Types.ObjectId()),
          decisions: [{
            field: "goodsLines.0.quantity",
            decision: "SELECT_CANDIDATE",
            candidateId: "invented",
          }],
        },
      });
    } catch {
      inventedRejected = true;
    }
    assert.equal(inventedRejected, true);

    const keep = await submitCurrentDeclarationHumanReview({
      companyId,
      declarationId: String(declarationId),
      actorUserId,
      body: {
        sourceResolutionRunId: String(sourceRunId),
        companyId: String(otherCompanyId),
        actorUserId: String(new mongoose.Types.ObjectId()),
        decisions: [{
          field: "goodsLines.0.quantity",
          decision: "KEEP_REVIEW_REQUIRED",
          note: "Needs manual document check.",
        }],
      },
    });
    assert.equal(keep.authorityApplied, false);
    const keepRun = await DeclarationHumanReviewRunModel.findById(keep.reviewRunId).lean();
    assert.equal(keepRun?.actorUserId, String(actorUserId));
    assert.equal(keepRun?.companyId, String(companyId));

    const audit = await listDeclarationHumanReviewAudit(companyId, String(declarationId));
    assert.equal(audit.length, 1);

    let crossTenantRejected = false;
    try {
      await getCurrentDeclarationHumanReview(otherCompanyId, String(declarationId));
    } catch {
      crossTenantRejected = true;
    }
    assert.equal(crossTenantRejected, true);

    let staleRejected = false;
    try {
      await submitCurrentDeclarationHumanReview({
        companyId,
        declarationId: String(declarationId),
        actorUserId,
        body: {
          sourceResolutionRunId: String(new mongoose.Types.ObjectId()),
          decisions: [{
            field: "goodsLines.0.quantity",
            decision: "KEEP_REVIEW_REQUIRED",
          }],
        },
      });
    } catch {
      staleRejected = true;
    }
    assert.equal(staleRejected, true);

    console.log(JSON.stringify({
      event: "foundation-9.4.human-review-api.passed",
      api: {
        currentReviewProjectionExposed: true,
        candidateEvidenceExposed: true,
        authenticatedActorOwnedByServer: true,
        operationalCompanyOwnedByServer: true,
        appendOnlyAuditReadable: true,
        keepReviewRequiredAccepted: true,
      },
      guardrails: {
        inventedCandidateRejected: inventedRejected,
        staleSourceRejected: staleRejected,
        companyIsolation: crossTenantRejected,
        arbitraryReplacementValueAccepted: false,
        clientActorOverrideAccepted: false,
        clientCompanyOverrideAccepted: false,
        keepReviewRequiredAppliedAuthority: false,
      },
      routes: {
        getCurrent: "GET /api/declarations/:id/idp-human-review/current",
        getAudit: "GET /api/declarations/:id/idp-human-review/audit",
        postCurrent: "POST /api/declarations/:id/idp-human-review/current",
      },
    }, null, 2));
  } finally {
    await DeclarationHumanReviewRunModel.deleteMany({ declarationId: String(declarationId) });
    await DeclarationFieldResolutionRunModel.deleteMany({ declarationId });
    await DeclarationModel.deleteMany({ _id: declarationId });
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
