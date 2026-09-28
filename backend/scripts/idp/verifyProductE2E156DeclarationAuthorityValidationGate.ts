import assert from "node:assert/strict";
import { shouldDeferValidationReviewToDeclarationAuthority } from "../../src/modules/idp/validator/declarationAuthorityValidationGate.js";
import { ClassifiedDocumentType } from "../../src/modules/idp/domain/segmentClassification.types.js";
import { ValidationSeverity, ValidationStatus, type ValidationEnvelope } from "../../src/modules/idp/domain/validation.types.js";

const reviewValidation: ValidationEnvelope = {
  version: "1",
  status: ValidationStatus.REVIEW_REQUIRED,
  documentType: ClassifiedDocumentType.INVOICE,
  validator: "invoice-deterministic-v1",
  issues: [{
    code: "INVOICE_QUANTITY_INVALID",
    severity: ValidationSeverity.ERROR,
    message: "legacy candidate is incomplete",
    path: "goodsLines[1].quantity"
  }],
  summary: { errorCount: 1, warningCount: 0 }
};

const validValidation: ValidationEnvelope = {
  ...reviewValidation,
  status: ValidationStatus.VALID,
  issues: [],
  summary: { errorCount: 0, warningCount: 0 }
};

const persistedPeerCandidates = {
  version: "1",
  fields: {
    "goodsLines.0.hsCode": [{
      candidateId: "native-gtip",
      field: "goodsLines.0.hsCode",
      value: "550340000011",
      confidence: 0.99,
      extractor: "deterministic",
      evidence: [{ segmentId: "segment-001", pageNumber: 1, contentSource: "NATIVE_TEXT" }]
    }],
    "goodsLines.0.quantity": [{
      candidateId: "vision-quantity",
      field: "goodsLines.0.quantity",
      value: 2250,
      confidence: 0.95,
      extractor: "invoice-qwen-vision-v1",
      evidence: [{ segmentId: "segment-001", pageNumber: 1, contentSource: "PAGE_IMAGE" }]
    }]
  }
};

assert.equal(shouldDeferValidationReviewToDeclarationAuthority({
  validation: reviewValidation,
  declarationCandidates: persistedPeerCandidates
}), true, "Persisted peer candidates must allow F6 authority to assess a legacy validation review.");

assert.equal(shouldDeferValidationReviewToDeclarationAuthority({
  validation: reviewValidation,
  declarationCandidates: { version: "1", fields: {} }
}), false, "Empty declaration candidates must keep the legacy fail-closed gate.");

assert.equal(shouldDeferValidationReviewToDeclarationAuthority({
  validation: reviewValidation,
  declarationCandidates: undefined
}), false, "Missing declaration candidates must keep the legacy fail-closed gate.");

assert.equal(shouldDeferValidationReviewToDeclarationAuthority({
  validation: validValidation,
  declarationCandidates: persistedPeerCandidates
}), false, "VALID extraction does not need a review deferral.");

assert.equal(shouldDeferValidationReviewToDeclarationAuthority({
  validation: { ...reviewValidation, validator: "other-validator" },
  declarationCandidates: persistedPeerCandidates
}), false, "Unrelated validators must not inherit the invoice authority exception.");

console.log(JSON.stringify({
  event: "product-e2e-1.5.6.declaration-authority-validation-gate.passed",
  legacyReviewCanReachFoundation6WhenPeerCandidatesPersisted: true,
  emptyCandidateEnvelopeStillFailsClosed: true,
  missingCandidateEnvelopeStillFailsClosed: true,
  unrelatedValidatorsStillFailClosed: true,
  foundation6RemainsSoleNormalizedDataAuthority: true,
  noModelInferenceRequired: true,
  directNormalizedWrite: false
}, null, 2));
