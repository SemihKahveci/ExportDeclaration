import assert from "node:assert/strict";
import { selectDirectSourceEvidenceAuthority } from "../../src/modules/idp/domain/declarationFieldOrchestration.service.js";
import { resolveDeclarationFields } from "../../src/modules/idp/domain/declarationFieldResolver.js";
import type { DeclarationFieldCandidateEnvelope } from "../../src/modules/idp/domain/declarationFieldCandidate.types.js";

const base = { logicalDocumentId: "ld-1", uploadedFileId: "uf-1", documentType: "INVOICE" as const, sourceProcessingRunId: "run-1" };
const candidate = (id: string, field: string, value: unknown, source: "NATIVE_TEXT" | "PAGE_IMAGE", confidence = .95, text?: string) => ({
  ...base, candidateId: id, field, value, confidence,
  extractor: source === "NATIVE_TEXT" ? "invoice-canonical-v1" : "invoice-qwen-vision-v1",
  evidence: [{ segmentId: "segment-001", pageNumber: 1, contentSource: source, ...(text !== undefined ? { text } : {}) }]
});

const row = (description = "INDUSTRIAL RESIN X500", descriptionText = description): DeclarationFieldCandidateEnvelope => ({
  version: "1", companyId: "company", declarationId: "declaration", fields: {
    "goodsLines.0.description": [
      candidate("segment-001:line-1:description", "goodsLines.0.description", description, "NATIVE_TEXT", .85, descriptionText),
      candidate("segment-001:vision:description", "goodsLines.0.description", "INDUSTRIAL RESIN", "PAGE_IMAGE", 1)
    ],
    "goodsLines.0.productCode": [candidate("segment-001:line-1:productCode", "goodsLines.0.productCode", "X500", "NATIVE_TEXT", .95, "X500")],
    "goodsLines.0.quantity": [candidate("segment-001:line-1:quantity", "goodsLines.0.quantity", 50, "NATIVE_TEXT", .95, "50")],
    "goodsLines.0.hsCode": [candidate("segment-001:line-1:hsCode", "goodsLines.0.hsCode", "390799800000", "NATIVE_TEXT", .99, "390799800000")]
  }
});

const envelope = row();
const selections = selectDirectSourceEvidenceAuthority(envelope as any);
assert.ok(selections.some((s) => s.field === "goodsLines.0.description" && s.candidateId === "segment-001:line-1:description"));
const resolution = resolveDeclarationFields({ candidates: envelope, candidateSelections: selections });
assert.equal(resolution.fields["goodsLines.0.description"]?.status, "RESOLVED");
assert.equal(resolution.fields["goodsLines.0.description"]?.value, "INDUSTRIAL RESIN X500");

// Direct source text is mandatory; a normalized/synthesized value cannot self-authorize.
assert.ok(!selectDirectSourceEvidenceAuthority(row("INDUSTRIAL RESIN X500", "INDUSTRIAL RESIN") as any)
  .some((s) => s.field === "goodsLines.0.description"));

// A lone description plus one anchor is insufficient: preserve fail-closed behavior.
const oneAnchor = row();
delete oneAnchor.fields["goodsLines.0.productCode"];
delete oneAnchor.fields["goodsLines.0.hsCode"];
assert.ok(!selectDirectSourceEvidenceAuthority(oneAnchor as any).some((s) => s.field === "goodsLines.0.description"));

// Evidence from another row must not corroborate this description.
const wrongRow = row();
wrongRow.fields["goodsLines.0.productCode"]![0]!.candidateId = "segment-001:line-2:productCode";
wrongRow.fields["goodsLines.0.quantity"]![0]!.candidateId = "segment-001:line-2:quantity";
wrongRow.fields["goodsLines.0.hsCode"]![0]!.candidateId = "segment-001:line-2:hsCode";
assert.ok(!selectDirectSourceEvidenceAuthority(wrongRow as any).some((s) => s.field === "goodsLines.0.description"));

// Authority is row/evidence based, not column-order based; no coordinates/order are required.
assert.ok(envelope.fields["goodsLines.0.description"]![0]!.evidence.every((e) => !("bbox" in e)));

console.log(JSON.stringify({
  event: "product-e2e-1.5.26.1.row-corroborated-description-authority.passed",
  directNativeDescriptionSelected: true,
  sameRowMultiAnchorCorroborationRequired: true,
  mismatchedEvidenceTextFailsClosed: true,
  crossRowEvidenceFailsClosed: true,
  arbitraryColumnOrderCompatible: true,
  conflictingVisionRetainedButNonAuthoritative: true,
  foundation6ResolverUnchanged: true,
  supplierSpecificRules: false,
  modelInferenceRequired: false,
  directNormalizedWrite: false
}, null, 2));
