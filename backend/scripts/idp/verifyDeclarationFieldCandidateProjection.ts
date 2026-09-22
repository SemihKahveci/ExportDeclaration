import assert from "node:assert/strict";
import { DocumentType } from "../../src/common/enums/documentType.js";
import type { DeclarationDocumentSet } from "../../src/modules/idp/domain/declarationDocumentSet.types.js";
import {
  DeclarationCandidateProjectionError,
  projectDeclarationFieldCandidates
} from "../../src/modules/idp/domain/declarationFieldCandidateProjector.js";
import type { FieldCandidateEnvelope } from "../../src/modules/idp/domain/fieldCandidate.types.js";

const documentSet: DeclarationDocumentSet = {
  version: "1",
  companyId: "company-a",
  declarationId: "declaration-a",
  documents: [
    { logicalDocumentId: "ld-invoice", uploadedFileId: "file-combined", type: DocumentType.INVOICE, pageStart: 1, pageEnd: 2, sourceProcessingRunId: "run-combined" },
    { logicalDocumentId: "ld-atr", uploadedFileId: "file-combined", type: DocumentType.ATR, pageStart: 3, pageEnd: 3, sourceProcessingRunId: "run-combined" },
    { logicalDocumentId: "ld-packing", uploadedFileId: "file-packing", type: DocumentType.PACKING_LIST, pageStart: 1, pageEnd: 1, sourceProcessingRunId: "run-packing" }
  ],
  roles: {}
};

function envelope(candidateId: string, field: string, value: unknown, pageNumber: number): FieldCandidateEnvelope {
  return {
    version: "1",
    fields: {
      [field]: [{
        candidateId,
        field,
        value,
        confidence: 0.96,
        extractor: "foundation-6.4-fixture",
        evidence: [{ segmentId: `segment-${candidateId}`, pageNumber, text: String(value), contentSource: "NATIVE_TEXT" }]
      }]
    }
  };
}

const projected = projectDeclarationFieldCandidates({
  documentSet,
  sources: [
    { uploadedFileId: "file-combined", sourceProcessingRunId: "run-combined", candidates: envelope("invoice-weight", "grossWeight", 12, 2) },
    { uploadedFileId: "file-combined", sourceProcessingRunId: "run-combined", candidates: envelope("atr-origin", "originCountry", "TR", 3) },
    { uploadedFileId: "file-packing", sourceProcessingRunId: "run-packing", candidates: envelope("packing-weight", "grossWeight", 12, 1) }
  ]
});

assert.equal(projected.fields.grossWeight?.length, 2);
assert.equal(projected.fields.originCountry?.[0]?.logicalDocumentId, "ld-atr");
assert.deepEqual(projected.fields.grossWeight?.map((item) => item.documentType).sort(), [DocumentType.INVOICE, DocumentType.PACKING_LIST].sort());
assert.ok(projected.fields.grossWeight?.every((item) => item.evidence.length === 1));
assert.ok(projected.fields.grossWeight?.every((item) => Boolean(item.sourceProcessingRunId)));

let straddleRejected = false;
try {
  projectDeclarationFieldCandidates({
    documentSet,
    sources: [{
      uploadedFileId: "file-combined",
      sourceProcessingRunId: "run-combined",
      candidates: {
        version: "1",
        fields: {
          bad: [{
            candidateId: "straddling-candidate", field: "bad", value: "x", confidence: 1,
            extractor: "fixture",
            evidence: [
              { segmentId: "s1", pageNumber: 2, contentSource: "NATIVE_TEXT" },
              { segmentId: "s2", pageNumber: 3, contentSource: "NATIVE_TEXT" }
            ]
          }]
        }
      }
    }]
  });
} catch (error) {
  straddleRejected = error instanceof DeclarationCandidateProjectionError && error.code === "EVIDENCE_OUTSIDE_LOGICAL_DOCUMENT";
}
assert.equal(straddleRejected, true);

let foreignFileRejected = false;
try {
  projectDeclarationFieldCandidates({
    documentSet,
    sources: [{ uploadedFileId: "foreign-file", sourceProcessingRunId: "foreign-run", candidates: envelope("foreign", "grossWeight", 99, 1) }]
  });
} catch (error) {
  foreignFileRejected = error instanceof DeclarationCandidateProjectionError && error.code === "UNKNOWN_UPLOADED_FILE";
}
assert.equal(foreignFileRejected, true);

console.log(JSON.stringify({
  event: "foundation-6.4.declaration-field-candidate-projection.passed",
  projection: {
    fields: Object.keys(projected.fields).sort(),
    grossWeightCandidateCount: projected.fields.grossWeight?.length ?? 0,
    logicalDocuments: [...new Set(Object.values(projected.fields).flat().map((item) => item.logicalDocumentId))].sort(),
    documentTypes: [...new Set(Object.values(projected.fields).flat().map((item) => item.documentType))].sort(),
    evidencePreserved: true,
    sourceProcessingRunPreserved: true
  },
  guardrails: {
    crossLogicalDocumentEvidenceRejected: straddleRejected,
    foreignUploadedFileRejected: foreignFileRejected,
    silentFirstDocumentMapping: false
  }
}, null, 2));
