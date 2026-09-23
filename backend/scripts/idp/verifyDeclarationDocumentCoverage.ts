import assert from "node:assert/strict";
import mongoose from "mongoose";
import { DocumentType } from "../../src/common/enums/documentType.js";
import { assessDeclarationDocumentCoverage } from "../../src/modules/idp/domain/declarationDocumentCoverage.js";
import { buildDeclarationDocumentSet } from "../../src/modules/idp/domain/declarationDocumentSet.js";

const companyId = new mongoose.Types.ObjectId();
const declarationId = new mongoose.Types.ObjectId();
const sharedFileId = new mongoose.Types.ObjectId();
const packingFileId = new mongoose.Types.ObjectId();

const set = buildDeclarationDocumentSet({
  companyId: String(companyId),
  declarationId: String(declarationId),
  logicalDocuments: [
    { _id: new mongoose.Types.ObjectId(), uploadedFileId: sharedFileId, type: DocumentType.INVOICE, pageStart: 1, pageEnd: 2 },
    { _id: new mongoose.Types.ObjectId(), uploadedFileId: sharedFileId, type: DocumentType.ATR, pageStart: 3, pageEnd: 3 },
    { _id: new mongoose.Types.ObjectId(), uploadedFileId: packingFileId, type: DocumentType.PACKING_LIST, pageStart: 1, pageEnd: 1 }
  ] as any
});

const complete = assessDeclarationDocumentCoverage(set, {
  version: "1",
  requirements: [
    { documentType: DocumentType.INVOICE, required: true, minCount: 1, maxCount: 1 },
    { documentType: DocumentType.PACKING_LIST, required: true, minCount: 1, maxCount: 1 }
  ]
});
assert.equal(complete.status, "COMPLETE");
assert.deepEqual(complete.missingRequiredTypes, []);
assert.deepEqual(complete.excessTypes, []);
assert.deepEqual(complete.unconfiguredPresentTypes, [DocumentType.ATR]);
assert.equal(complete.physicalFileCount, 2);
assert.equal(complete.logicalDocumentCount, 3);
assert.equal(complete.roles.find((role) => role.documentType === DocumentType.INVOICE)?.actualCount, 1);

const missing = assessDeclarationDocumentCoverage(set, {
  version: "1",
  requirements: [
    { documentType: DocumentType.INVOICE, required: true },
    { documentType: DocumentType.CERTIFICATE_OF_ORIGIN, required: true }
  ]
});
assert.equal(missing.status, "INCOMPLETE");
assert.deepEqual(missing.missingRequiredTypes, [DocumentType.CERTIFICATE_OF_ORIGIN]);

const duplicateInvoiceSet = buildDeclarationDocumentSet({
  companyId: String(companyId),
  declarationId: String(declarationId),
  logicalDocuments: [
    { _id: new mongoose.Types.ObjectId(), uploadedFileId: new mongoose.Types.ObjectId(), type: DocumentType.INVOICE, pageStart: 1, pageEnd: 1 },
    { _id: new mongoose.Types.ObjectId(), uploadedFileId: new mongoose.Types.ObjectId(), type: DocumentType.INVOICE, pageStart: 1, pageEnd: 1 }
  ] as any
});
const excess = assessDeclarationDocumentCoverage(duplicateInvoiceSet, {
  version: "1",
  requirements: [{ documentType: DocumentType.INVOICE, required: true, minCount: 1, maxCount: 1 }]
});
assert.equal(excess.status, "INCOMPLETE");
assert.deepEqual(excess.excessTypes, [DocumentType.INVOICE]);
assert.equal(excess.roles[0]?.status, "EXCESS");

const invalid = assessDeclarationDocumentCoverage(set, {
  version: "1",
  requirements: [
    { documentType: DocumentType.INVOICE, required: true },
    { documentType: DocumentType.INVOICE, required: false }
  ]
});
assert.equal(invalid.status, "INVALID_PROFILE");

const invalidCardinality = assessDeclarationDocumentCoverage(set, {
  version: "1",
  requirements: [{ documentType: DocumentType.INVOICE, required: true, minCount: 2, maxCount: 1 }]
});
assert.equal(invalidCardinality.status, "INVALID_PROFILE");

console.log(JSON.stringify({
  event: "foundation-7.1.declaration-document-coverage.passed",
  coverage: {
    explicitProfileOnly: true,
    completeDocumentSetRecognized: true,
    missingRequiredRoleDetected: true,
    excessRoleDetected: true,
    unconfiguredPresentRoleIsInformational: true,
    physicalVsLogicalDocumentCountsPreserved: true
  },
  guardrails: {
    customsRequirementsInvented: false,
    duplicateRequirementRejected: true,
    invalidCardinalityRejected: true,
    unconfiguredRoleRejected: false
  }
}, null, 2));
