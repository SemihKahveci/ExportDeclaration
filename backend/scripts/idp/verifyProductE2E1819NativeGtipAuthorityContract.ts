import assert from "node:assert/strict";
import { canonicalNativeGoodsCodeCandidatesOf } from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";
import { selectDirectSourceEvidenceAuthority } from "../../src/modules/idp/domain/declarationFieldOrchestration.service.js";
import { resolveDeclarationFields } from "../../src/modules/idp/domain/declarationFieldResolver.js";

const provenance = {
  logicalDocumentId: "logical-1",
  uploadedFileId: "file-1",
  documentType: "INVOICE",
  sourceProcessingRunId: "run-1"
};
const evidence = (text: string) => [{ segmentId: "segment-001", pageNumber: 4, contentSource: "NATIVE_TEXT" as const, text }];
const genericCandidate = (field: string, value: string, text = value) => ({
  candidateId: `segment-001:generic:${field}`,
  field,
  value,
  confidence: 0.98,
  extractor: "invoice-generic-layout-v15",
  evidence: evidence(text)
});
const visionCandidate = (field: string, value: string) => ({
  candidateId: `segment-001:vision:${field}`,
  field,
  value,
  confidence: 1,
  extractor: "invoice-qwen-vision-v1",
  evidence: [{ segmentId: "segment-001", pageNumber: 4, contentSource: "PAGE_IMAGE" as const }],
  ...provenance
});

const data: any = {
  genericCandidateAudit: {
    candidates: {
      version: "1",
      fields: {
        "goodsLines.23.hsCode": [genericCandidate("goodsLines.23.hsCode", "853890990000")],
        "goodsLines.24.hsCode": [genericCandidate("goodsLines.24.hsCode", "853620100011")],
        "goodsLines.25.hsCode": [genericCandidate("goodsLines.25.hsCode", "853620100011")],
        "goodsLines.26.hsCode": [genericCandidate("goodsLines.26.hsCode", "853620100011", "wrong-evidence")],
        "goodsLines.27.hsCode": [genericCandidate("goodsLines.27.hsCode", "280900")]
      }
    },
    validation: {
      rows: [
        { rowIndex: 23, issues: [] },
        { rowIndex: 24, issues: [] },
        { rowIndex: 25, issues: [{ field: "goodsLines.25.hsCode", code: "EVIDENCE_NOT_SUPPORTED_BY_CANONICAL" }] },
        { rowIndex: 26, issues: [] },
        { rowIndex: 27, issues: [] }
      ]
    }
  }
};

const native = canonicalNativeGoodsCodeCandidatesOf(data);
assert.equal(native.fields["goodsLines.23.hsCode"]?.[0]?.value, "853890990000");
assert.equal(native.fields["goodsLines.24.hsCode"]?.[0]?.value, "853620100011");
assert.equal(native.fields["goodsLines.25.hsCode"], undefined, "invalid canonical evidence must fail closed");
assert.equal(native.fields["goodsLines.26.hsCode"], undefined, "candidate value must match its own native evidence");
assert.equal(native.fields["goodsLines.27.hsCode"], undefined, "short HS codes must never become GTIP authority");

const fields: any = {};
for (const field of ["goodsLines.23.hsCode", "goodsLines.24.hsCode"]) {
  fields[field] = [
    visionCandidate(field, field.endsWith("23.hsCode") ? "AG.SCH.33769" : "280900"),
    ...native.fields[field]!.map((candidate: any) => ({ ...candidate, ...provenance }))
  ];
}
const envelope: any = { version: "1", companyId: "company-1", declarationId: "declaration-1", fields };
const selections = selectDirectSourceEvidenceAuthority(envelope);
const resolution = resolveDeclarationFields({ candidates: envelope, candidateSelections: selections });
assert.equal(resolution.fields["goodsLines.23.hsCode"]?.status, "RESOLVED");
assert.equal(resolution.fields["goodsLines.23.hsCode"]?.value, "853890990000");
assert.equal(resolution.fields["goodsLines.24.hsCode"]?.status, "RESOLVED");
assert.equal(resolution.fields["goodsLines.24.hsCode"]?.value, "853620100011");

console.log(JSON.stringify({
  event: "product-e2e-1.8.19.native-gtip-authority.contract.passed",
  guardrails: {
    exact12NativeEvidenceCanEnterFoundation6: true,
    conflictingVisionProductCodeCannotOutrankNativeGtip: true,
    shortHsFailsClosed: true,
    invalidEvidenceFailsClosed: true,
    mismatchedEvidenceFailsClosed: true,
    supplierSpecificRules: false,
    directNormalizedWrite: false
  }
}, null, 2));
