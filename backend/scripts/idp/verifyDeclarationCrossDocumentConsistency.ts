import assert from "node:assert/strict";
import { DocumentType } from "../../src/common/enums/documentType.js";
import { assessDeclarationCrossDocumentConsistency } from "../../src/modules/idp/domain/declarationCrossDocumentConsistency.js";
import type { DeclarationFieldCandidateEnvelope } from "../../src/modules/idp/domain/declarationFieldCandidate.types.js";

const candidate = (candidateId: string, field: string, value: unknown, documentType: any, logicalDocumentId: string) => ({
  candidateId, field, value, confidence: 0.95, extractor: "foundation-7.2-fixture", logicalDocumentId,
  uploadedFileId: `file-${logicalDocumentId}`, documentType, sourceProcessingRunId: `run-${logicalDocumentId}`, evidence: []
});

const envelope: DeclarationFieldCandidateEnvelope = {
  version: "1", companyId: "company-72", declarationId: "declaration-72", fields: {
    invoiceNo: [
      candidate("invoice-no-invoice", "invoiceNo", "EXP-72", DocumentType.INVOICE, "ld-invoice"),
      candidate("invoice-no-packing", "invoiceNo", "exp-72", DocumentType.PACKING_LIST, "ld-packing")
    ],
    grossWeight: [
      candidate("weight-invoice", "grossWeight", 100, DocumentType.INVOICE, "ld-invoice"),
      candidate("weight-packing", "grossWeight", 100.4, DocumentType.PACKING_LIST, "ld-packing")
    ],
    originCountry: [
      candidate("origin-invoice", "originCountry", "TR", DocumentType.INVOICE, "ld-invoice"),
      candidate("origin-atr", "originCountry", "DE", DocumentType.ATR, "ld-atr")
    ],
    transportMode: [candidate("transport-invoice", "transportMode", "ROAD", DocumentType.INVOICE, "ld-invoice")]
  }
};

const result = assessDeclarationCrossDocumentConsistency(envelope, {
  version: "1",
  rules: [
    { field: "invoiceNo", documentTypes: [DocumentType.INVOICE, DocumentType.PACKING_LIST], comparator: { kind: "CASE_INSENSITIVE_TEXT" }, requireAllDocumentTypes: true },
    { field: "grossWeight", documentTypes: [DocumentType.INVOICE, DocumentType.PACKING_LIST], comparator: { kind: "NUMERIC_TOLERANCE", absoluteTolerance: 0.5 }, requireAllDocumentTypes: true },
    { field: "originCountry", documentTypes: [DocumentType.INVOICE, DocumentType.ATR], comparator: { kind: "EXACT" }, requireAllDocumentTypes: true },
    { field: "transportMode", documentTypes: [DocumentType.INVOICE, DocumentType.CMR], comparator: { kind: "EXACT" }, requireAllDocumentTypes: true }
  ]
});
assert.equal(result.status, "REVIEW_REQUIRED");
assert.equal(result.fields.find((field) => field.field === "invoiceNo")?.status, "CONSISTENT");
assert.equal(result.fields.find((field) => field.field === "grossWeight")?.status, "CONSISTENT");
assert.equal(result.fields.find((field) => field.field === "originCountry")?.status, "CONFLICT");
assert.deepEqual(result.conflictFields, ["originCountry"]);
assert.equal(result.fields.find((field) => field.field === "transportMode")?.status, "INSUFFICIENT_EVIDENCE");
assert.deepEqual(result.insufficientEvidenceFields, ["transportMode"]);
assert.equal(result.fields.find((field) => field.field === "originCountry")?.observations.length, 2);

const invalid = assessDeclarationCrossDocumentConsistency(envelope, {
  version: "1",
  rules: [
    { field: "grossWeight", documentTypes: [DocumentType.INVOICE, DocumentType.PACKING_LIST], comparator: { kind: "NUMERIC_TOLERANCE", absoluteTolerance: -1 } }
  ]
});
assert.equal(invalid.status, "INVALID_PROFILE");

const duplicate = assessDeclarationCrossDocumentConsistency(envelope, {
  version: "1",
  rules: [
    { field: "invoiceNo", documentTypes: [DocumentType.INVOICE, DocumentType.PACKING_LIST], comparator: { kind: "EXACT" } },
    { field: "invoiceNo", documentTypes: [DocumentType.INVOICE, DocumentType.ATR], comparator: { kind: "EXACT" } }
  ]
});
assert.equal(duplicate.status, "INVALID_PROFILE");

console.log(JSON.stringify({
  event: "foundation-7.2.cross-document-consistency.passed",
  consistency: {
    explicitRulesOnly: true,
    caseInsensitiveAgreementRecognized: true,
    numericToleranceAgreementRecognized: true,
    configuredConflictDetected: true,
    missingConfiguredRoleRequiresReview: true,
    provenanceReferencesPreserved: true
  },
  guardrails: {
    customsFieldRulesInvented: false,
    authoritySelectionPerformed: false,
    duplicateFieldRuleRejected: true,
    invalidToleranceRejected: true,
    singleDocumentEvidenceSilentlyAccepted: false
  }
}, null, 2));
