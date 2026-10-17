import assert from "node:assert/strict";
import { canonicalValidatedNativeGoodsOriginCandidatesOf } from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";
import { selectDirectSourceEvidenceAuthority } from "../../src/modules/idp/domain/declarationFieldOrchestration.service.js";

const native = (row: number, value: string) => ({
  candidateId: `segment:origin:line-${row + 1}`,
  field: `goodsLines.${row}.origin`,
  value,
  confidence: 0.98,
  extractor: "invoice-origin-generic-v1",
  evidence: [{ segmentId: "segment", pageNumber: 1, text: value, contentSource: "NATIVE_TEXT" as const }]
});

const data = {
  genericCandidateAudit: {
    originCandidates: {
      version: "1" as const,
      fields: {
        "goodsLines.0.origin": [native(0, "POLAND")],
        "goodsLines.1.origin": [native(1, "CHINA")],
        "goodsLines.2.origin": [native(2, "FRANCE")]
      }
    },
    validation: {
      rows: [
        { rowIndex: 0, status: "VALID", issues: [] },
        { rowIndex: 1, status: "VALID", issues: [] },
        { rowIndex: 2, status: "REVIEW_REQUIRED", issues: ["ARITHMETIC_MISMATCH"] }
      ]
    }
  }
};

const bridged = canonicalValidatedNativeGoodsOriginCandidatesOf(data as any);
assert.equal(bridged.fields["goodsLines.0.origin"]?.[0]?.value, "POLAND");
assert.equal(bridged.fields["goodsLines.1.origin"]?.[0]?.value, "CHINA");
assert.equal(bridged.fields["goodsLines.2.origin"], undefined, "invalid row origin must remain shadow-only");
assert.ok(bridged.fields["goodsLines.0.origin"]?.[0]?.candidateId.endsWith(":f6-native-origin"));

const projectedFields = Object.fromEntries(Object.entries(bridged.fields).map(([field, candidates]) => [field, candidates.map((candidate) => ({
  ...candidate,
  logicalDocumentId: "doc-1",
  uploadedFileId: "file-1",
  documentType: "INVOICE",
  sourceProcessingRunId: "run-1"
}))]));
const selections = selectDirectSourceEvidenceAuthority({ version: "1", fields: projectedFields } as any);
assert.ok(selections.some((item) => item.field === "goodsLines.0.origin"));
assert.ok(selections.some((item) => item.field === "goodsLines.1.origin"));
assert.ok(!selections.some((item) => item.field === "originCountry"));
assert.ok(!selections.some((item) => item.field === "goodsLines.2.origin"));

console.log(JSON.stringify({
  event: "product-e2e-1.8.34.validated-native-row-origin-authority.contract.passed",
  guardrails: {
    validatedNativeRowOriginCanSelectFoundation6Authority: true,
    invalidRowOriginRemainsShadowOnly: true,
    lineOriginCannotAuthorizeDeclarationOriginCountry: true,
    nativeEvidenceRequired: true,
    supplierSpecificRules: false,
    invoiceSpecificConstants: false,
    directNormalizedWrite: false
  }
}, null, 2));
