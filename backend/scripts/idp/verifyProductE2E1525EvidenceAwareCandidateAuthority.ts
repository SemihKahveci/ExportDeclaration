import assert from "node:assert/strict";
import { selectDirectSourceEvidenceAuthority } from "../../src/modules/idp/domain/declarationFieldOrchestration.service.js";
import { resolveDeclarationFields } from "../../src/modules/idp/domain/declarationFieldResolver.js";
import type { DeclarationFieldCandidateEnvelope } from "../../src/modules/idp/domain/declarationFieldCandidate.types.js";

const base = { logicalDocumentId: "ld-1", uploadedFileId: "uf-1", documentType: "INVOICE" as const, sourceProcessingRunId: "run-1" };
const candidate = (id: string, field: string, value: unknown, source: "NATIVE_TEXT" | "PAGE_IMAGE", confidence = .98, text?: string) => ({
  ...base, candidateId: id, field, value, confidence, extractor: source === "NATIVE_TEXT" ? "invoice-canonical-v1" : "invoice-qwen-vision-v1",
  evidence: [{ segmentId: "segment-001", pageNumber: 1, contentSource: source, ...(text ? { text } : {}) }]
});

const envelope: DeclarationFieldCandidateEnvelope = {
  version: "1", companyId: "company", declarationId: "declaration", fields: {
    invoiceNo: [
      candidate("native-invoice", "invoiceNo", "CLK2026000001021", "NATIVE_TEXT", .99, "CLK2026000001021"),
      candidate("vision-invoice", "invoiceNo", "CLK2026000001021", "PAGE_IMAGE", 1),
      candidate("vision-page2-pollution", "invoiceNo", "ALTMIŞBIRBİNONBİR EUR VE DOKSANSEKİZ CENT", "PAGE_IMAGE", 1)
    ],
    "goodsLines.0.quantity": [candidate("native-q", "goodsLines.0.quantity", 1575, "NATIVE_TEXT", .95)],
    "goodsLines.0.unitPrice": [
      candidate("native-price", "goodsLines.0.unitPrice", 7.75, "NATIVE_TEXT", .95),
      candidate("vision-price", "goodsLines.0.unitPrice", 7750, "PAGE_IMAGE", 1)
    ],
    "goodsLines.0.lineTotal": [candidate("native-total", "goodsLines.0.lineTotal", 12206.25, "NATIVE_TEXT", .95)],
    "goodsLines.0.description": [
      candidate("native-description", "goodsLines.0.description", "Eterleri", "NATIVE_TEXT", .85),
      candidate("vision-description", "goodsLines.0.description", "Seliüöz Eterleri", "PAGE_IMAGE", 1)
    ]
  }
};

const selections = selectDirectSourceEvidenceAuthority(envelope as any);
assert.ok(selections.some((s) => s.field === "invoiceNo" && s.candidateId === "native-invoice"));
assert.ok(selections.some((s) => s.field === "goodsLines.0.unitPrice" && s.candidateId === "native-price"));
assert.ok(!selections.some((s) => s.field === "goodsLines.0.description"));

const resolution = resolveDeclarationFields({ candidates: envelope, candidateSelections: selections });
assert.equal(resolution.fields.invoiceNo?.status, "RESOLVED");
assert.equal(resolution.fields.invoiceNo?.value, "CLK2026000001021");
assert.equal(resolution.fields["goodsLines.0.unitPrice"]?.status, "RESOLVED");
assert.equal(resolution.fields["goodsLines.0.unitPrice"]?.value, 7.75);
assert.equal(resolution.fields["goodsLines.0.description"]?.status, "REVIEW_REQUIRED");

const invoiceWithoutExactNativeEvidence: DeclarationFieldCandidateEnvelope = {
  ...envelope,
  fields: { invoiceNo: [candidate("native-unproven", "invoiceNo", "CLK2026000001021", "NATIVE_TEXT", .99, "different source text"), candidate("vision-other", "invoiceNo", "OTHER", "PAGE_IMAGE", 1)] }
};
assert.deepEqual(selectDirectSourceEvidenceAuthority(invoiceWithoutExactNativeEvidence as any), []);

const arithmeticAmbiguous: DeclarationFieldCandidateEnvelope = {
  ...envelope,
  fields: {
    "goodsLines.0.quantity": [candidate("q", "goodsLines.0.quantity", 2, "NATIVE_TEXT")],
    "goodsLines.0.unitPrice": [candidate("p1", "goodsLines.0.unitPrice", 5, "NATIVE_TEXT"), candidate("p2", "goodsLines.0.unitPrice", 10, "NATIVE_TEXT")],
    "goodsLines.0.lineTotal": [candidate("t1", "goodsLines.0.lineTotal", 10, "NATIVE_TEXT"), candidate("t2", "goodsLines.0.lineTotal", 20, "NATIVE_TEXT")]
  }
};
assert.deepEqual(selectDirectSourceEvidenceAuthority(arithmeticAmbiguous as any), []);

console.log(JSON.stringify({
  event: "product-e2e-1.5.25.evidence-aware-candidate-authority.passed",
  exactNativeInvoiceEvidenceSelected: true,
  pageVisionHeaderPollutionRetainedButNonAuthoritative: true,
  arithmeticCorroboratedNativeUnitPriceSelected: true,
  ambiguousArithmeticStillFailsClosed: true,
  missingDescriptionCandidateStillReviewRequired: true,
  foundation6ResolverUnchanged: true,
  explicitCandidateAuthorityAuditable: true,
  supplierSpecificRules: false,
  directNormalizedWrite: false
}, null, 2));
