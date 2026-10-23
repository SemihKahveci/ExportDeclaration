import assert from "node:assert/strict";
import { DocumentType } from "../../src/common/enums/documentType.js";
import type { DeclarationDocumentSet } from "../../src/modules/idp/domain/declarationDocumentSet.types.js";
import {
  DeclarationCandidateProjectionError,
  projectDeclarationFieldCandidates
} from "../../src/modules/idp/domain/declarationFieldCandidateProjector.js";
import { selectDirectSourceEvidenceAuthority } from "../../src/modules/idp/domain/declarationFieldOrchestration.service.js";
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

function invoiceEnvelope(fileTag: string, fields: Record<string, unknown>): FieldCandidateEnvelope {
  return {
    version: "1",
    fields: Object.fromEntries(Object.entries(fields).map(([field, value]) => [field, [{
      candidateId: `${fileTag}:${field}`,
      field,
      value,
      confidence: 0.9,
      extractor: "fixture",
      evidence: [{ segmentId: fileTag, pageNumber: 1, text: String(value), contentSource: "NATIVE_TEXT" as const }]
    }]]))
  };
}

const twoInvoices = projectDeclarationFieldCandidates({
  documentSet: {
    ...documentSet,
    documents: [
      { logicalDocumentId: "ld-a", uploadedFileId: "file-a", type: DocumentType.INVOICE, pageStart: 1, pageEnd: 1, sourceProcessingRunId: "run-a" },
      { logicalDocumentId: "ld-b", uploadedFileId: "file-b", type: DocumentType.INVOICE, pageStart: 1, pageEnd: 1, sourceProcessingRunId: "run-b" },
      { logicalDocumentId: "ld-pack", uploadedFileId: "file-pack", type: DocumentType.PACKING_LIST, pageStart: 1, pageEnd: 1, sourceProcessingRunId: "run-pack" }
    ]
  },
  sources: [
    { uploadedFileId: "file-a", sourceProcessingRunId: "run-a", candidates: invoiceEnvelope("a", { "goodsLines.0.quantity": 10, totalAmount: 100, currency: "EUR", grossWeight: 5 }) },
    { uploadedFileId: "file-b", sourceProcessingRunId: "run-b", candidates: invoiceEnvelope("b", { "goodsLines.0.quantity": 4, "goodsLines.1.quantity": 6, totalAmount: 40, currency: "EUR", grossWeight: 7 }) },
    { uploadedFileId: "file-pack", sourceProcessingRunId: "run-pack", candidates: invoiceEnvelope("pack", { grossWeight: 12 }) }
  ]
});
assert.equal(twoInvoices.fields["goodsLines.0.quantity"]?.[0]?.value, 10);
assert.equal(twoInvoices.fields["goodsLines.1.quantity"]?.[0]?.value, 4);
assert.equal(twoInvoices.fields["goodsLines.2.quantity"]?.[0]?.value, 6);
assert.equal(twoInvoices.fields.totalAmount?.find((item) => item.derived)?.value, 140);
assert.deepEqual(twoInvoices.fields.grossWeight?.map((item) => item.value).sort(), [12, 12]);

const mixedCurrency = projectDeclarationFieldCandidates({
  documentSet: {
    ...documentSet,
    documents: [
      { logicalDocumentId: "ld-a", uploadedFileId: "file-a", type: DocumentType.INVOICE, pageStart: 1, pageEnd: 1, sourceProcessingRunId: "run-a" },
      { logicalDocumentId: "ld-b", uploadedFileId: "file-b", type: DocumentType.INVOICE, pageStart: 1, pageEnd: 1, sourceProcessingRunId: "run-b" }
    ]
  },
  sources: [
    { uploadedFileId: "file-a", sourceProcessingRunId: "run-a", candidates: invoiceEnvelope("a2", { "goodsLines.0.quantity": 1, totalAmount: 10, currency: "EUR" }) },
    { uploadedFileId: "file-b", sourceProcessingRunId: "run-b", candidates: invoiceEnvelope("b2", { "goodsLines.0.quantity": 1, totalAmount: 20, currency: "USD" }) }
  ]
});
assert.equal(mixedCurrency.fields.totalAmount?.some((item) => item.derived), false);
assert.equal(mixedCurrency.fields.totalAmount?.length, 2);

const sharedVisionId = "segment-001:vision:b1b5a35d6b9247e4";
function sharedEnvelope(field: string, value: unknown): FieldCandidateEnvelope {
  return {
    version: "1",
    fields: {
      [field]: [{
        candidateId: sharedVisionId,
        field,
        value,
        confidence: 0.9,
        extractor: "fixture",
        evidence: [{ segmentId: "segment-001", pageNumber: 1, text: String(value), contentSource: "NATIVE_TEXT" }]
      }]
    }
  };
}
const collided = projectDeclarationFieldCandidates({
  documentSet: {
    ...documentSet,
    documents: [
      { logicalDocumentId: "ld-a", uploadedFileId: "file-a", type: DocumentType.INVOICE, pageStart: 1, pageEnd: 1, sourceProcessingRunId: "run-a" },
      { logicalDocumentId: "ld-b", uploadedFileId: "file-b", type: DocumentType.INVOICE, pageStart: 1, pageEnd: 1, sourceProcessingRunId: "run-b" }
    ]
  },
  sources: [
    { uploadedFileId: "file-a", sourceProcessingRunId: "run-a", candidates: sharedEnvelope("currency", "EUR") },
    { uploadedFileId: "file-b", sourceProcessingRunId: "run-b", candidates: sharedEnvelope("currency", "EUR") }
  ]
});
const currencyIds = collided.fields.currency?.map((item) => item.candidateId) ?? [];
assert.equal(new Set(currencyIds).size, currencyIds.length);
assert.equal(currencyIds.length, 2);

const labelled = projectDeclarationFieldCandidates({
  documentSet: {
    ...documentSet,
    documents: [
      { logicalDocumentId: "ld-a", uploadedFileId: "file-a", type: DocumentType.INVOICE, pageStart: 1, pageEnd: 1, sourceProcessingRunId: "run-a" },
      { logicalDocumentId: "ld-b", uploadedFileId: "file-b", type: DocumentType.INVOICE, pageStart: 1, pageEnd: 1, sourceProcessingRunId: "run-b" }
    ]
  },
  sources: [
    { uploadedFileId: "file-a", sourceProcessingRunId: "run-a", candidates: {
      version: "1",
      fields: {
        "goodsLines.0.quantity": [{ candidateId: "a-qty", field: "goodsLines.0.quantity", value: 2, confidence: 0.9, extractor: "fixture", evidence: [{ segmentId: "a", pageNumber: 1, text: "2", contentSource: "NATIVE_TEXT" }] }],
        invoiceNo: [{ candidateId: "header-invoice-no:f6-header-party", field: "invoiceNo", value: "VED2026000000272", confidence: 0.99, extractor: "fixture", evidence: [{ segmentId: "a", pageNumber: 1, text: "VED2026000000272", contentSource: "NATIVE_TEXT" }] }],
        totalAmount: [
          { candidateId: "header-total-amount:f6-totalAmount", field: "totalAmount", value: 100, confidence: 0.98, extractor: "fixture", evidence: [{ segmentId: "a", pageNumber: 1, text: "100 EUR", contentSource: "NATIVE_TEXT" }] },
          { candidateId: "vision-total", field: "totalAmount", value: 9000, confidence: 0.4, extractor: "vision", evidence: [{ segmentId: "a", pageNumber: 1, text: "9000", contentSource: "PAGE_IMAGE" }] }
        ],
        currency: [{ candidateId: "cur-a", field: "currency", value: "EUR", confidence: 0.9, extractor: "fixture", evidence: [{ segmentId: "a", pageNumber: 1, text: "EUR", contentSource: "NATIVE_TEXT" }] }]
      }
    } },
    { uploadedFileId: "file-b", sourceProcessingRunId: "run-b", candidates: {
      version: "1",
      fields: {
        "goodsLines.0.quantity": [{ candidateId: "b-qty", field: "goodsLines.0.quantity", value: 3, confidence: 0.9, extractor: "fixture", evidence: [{ segmentId: "b", pageNumber: 1, text: "3", contentSource: "NATIVE_TEXT" }] }],
        invoiceNo: [{ candidateId: "header-invoice-no:f6-header-party", field: "invoiceNo", value: "VED2026000000273", confidence: 0.99, extractor: "fixture", evidence: [{ segmentId: "b", pageNumber: 1, text: "VED2026000000273", contentSource: "NATIVE_TEXT" }] }],
        totalAmount: [{ candidateId: "header-total-amount:f6-totalAmount", field: "totalAmount", value: 40, confidence: 0.98, extractor: "fixture", evidence: [{ segmentId: "b", pageNumber: 1, text: "40 EUR", contentSource: "NATIVE_TEXT" }] }],
        currency: [{ candidateId: "cur-b", field: "currency", value: "EUR", confidence: 0.9, extractor: "fixture", evidence: [{ segmentId: "b", pageNumber: 1, text: "EUR", contentSource: "NATIVE_TEXT" }] }]
      }
    } }
  ]
});
assert.equal(labelled.fields["goodsLines.0.invoiceNo"]?.[0]?.value, "VED2026000000272");
assert.equal(labelled.fields["goodsLines.1.invoiceNo"]?.[0]?.value, "VED2026000000273");
assert.equal(labelled.fields.totalAmount?.find((item) => item.derived)?.value, 140);
assert.equal(labelled.fields.invoiceNo?.length, 2);
const labelledAuthority = selectDirectSourceEvidenceAuthority(labelled as never);
assert.equal(labelledAuthority.find((item) => item.field === "totalAmount")?.candidateId, "multi-invoice-sum:totalAmount");
assert.equal(labelledAuthority.some((item) => item.field === "invoiceNo"), false);

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
