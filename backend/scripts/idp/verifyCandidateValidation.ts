import assert from "node:assert/strict";
import { validateResolvedCandidate } from "../../src/modules/idp/validator/documentValidatorRegistry.js";
import { CandidateResolutionStatus, type CandidateResolutionEnvelope } from "../../src/modules/idp/domain/candidateResolution.types.js";
import { ClassifiedDocumentType } from "../../src/modules/idp/domain/segmentClassification.types.js";
import { ValidationStatus } from "../../src/modules/idp/domain/validation.types.js";

function resolution(data: Record<string, unknown>): CandidateResolutionEnvelope {
  return {
    version: "1",
    status: CandidateResolutionStatus.RESOLVED,
    documentType: ClassifiedDocumentType.INVOICE,
    strategy: "SINGLE_CANDIDATE",
    sourceSegmentIds: ["segment-001"],
    data,
    issues: []
  };
}

const valid = validateResolvedCandidate(resolution({
  header: { currency: "EUR" },
  goodsLines: [{ lineNo: 1, hsCode: "853620100011", description: "Test", quantity: 2, unit: "ADET", unitPrice: 10, lineTotal: 20 }]
}));
assert.equal(valid.status, ValidationStatus.VALID);
assert.equal(valid.summary.errorCount, 0);

const warningsOnly = validateResolvedCandidate(resolution({
  header: {},
  goodsLines: [{ lineNo: 1, description: "Test", quantity: 2, unit: "ADET", unitPrice: 10, lineTotal: 20 }]
}));
assert.equal(warningsOnly.status, ValidationStatus.VALID);
assert.equal(warningsOnly.summary.errorCount, 0);
assert.ok(warningsOnly.summary.warningCount >= 2);

const invalid = validateResolvedCandidate(resolution({
  header: { currency: "EUR" },
  goodsLines: [
    { lineNo: 1, hsCode: "123", quantity: 0, unitPrice: 10, lineTotal: 20 },
    { lineNo: 1, hsCode: "853620100011", quantity: 1, unitPrice: -1, lineTotal: 20 }
  ]
}));
assert.equal(invalid.status, ValidationStatus.REVIEW_REQUIRED);
assert.ok(invalid.summary.errorCount >= 4);
assert.ok(invalid.issues.some((issue) => issue.code === "INVOICE_LINE_NUMBER_DUPLICATE"));
assert.ok(invalid.issues.some((issue) => issue.code === "INVOICE_GTIP_INVALID_FORMAT"));
assert.ok(invalid.issues.some((issue) => issue.code === "INVOICE_QUANTITY_INVALID"));

console.log(JSON.stringify({
  event: "idp.candidate-validation.regression.passed",
  cases: [
    { name: "valid", status: valid.status, ...valid.summary },
    { name: "warnings-only", status: warningsOnly.status, ...warningsOnly.summary },
    { name: "invalid", status: invalid.status, ...invalid.summary }
  ]
}, null, 2));
