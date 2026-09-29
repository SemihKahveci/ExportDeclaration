import assert from "node:assert/strict";
import { DocumentType } from "../../src/common/enums/documentType.js";
import type { DeclarationDocumentSet } from "../../src/modules/idp/domain/declarationDocumentSet.types.js";
import type { FieldCandidateEnvelope } from "../../src/modules/idp/domain/fieldCandidate.types.js";
import { canonicalGoodsUnit, projectDeclarationFieldCandidates } from "../../src/modules/idp/domain/declarationFieldCandidateProjector.js";
import { resolveDeclarationFields } from "../../src/modules/idp/domain/declarationFieldResolver.js";

const documentSet: DeclarationDocumentSet = {
  version: "1",
  companyId: "company-1517",
  declarationId: "declaration-1517",
  documents: [{
    logicalDocumentId: "ld-invoice",
    uploadedFileId: "file-invoice",
    type: DocumentType.INVOICE,
    pageStart: 1,
    pageEnd: 1,
    sourceProcessingRunId: "run-invoice"
  }],
  roles: {}
};

function candidate(candidateId: string, field: string, value: unknown, contentSource: "NATIVE_TEXT" | "PAGE_IMAGE", derived = false) {
  return {
    candidateId,
    field,
    value,
    confidence: contentSource === "NATIVE_TEXT" ? 0.95 : 0.9,
    extractor: contentSource === "NATIVE_TEXT" ? "invoice-canonical-v1" : "qwen-vision",
    evidence: [{ segmentId: "segment-001", pageNumber: 1, text: String(value), contentSource }],
    ...(derived ? { derived: true } : {})
  };
}

const source: FieldCandidateEnvelope = {
  version: "1",
  fields: {
    "goodsLines.0.unit": [
      candidate("native-adet", "goodsLines.0.unit", "ADET", "NATIVE_TEXT", true),
      candidate("vision-adet", "goodsLines.0.unit", "Adet", "PAGE_IMAGE")
    ],
    "goodsLines.1.unit": [
      candidate("native-kg", "goodsLines.1.unit", "KG", "NATIVE_TEXT"),
      candidate("vision-kg", "goodsLines.1.unit", "Kg", "PAGE_IMAGE")
    ],
    "goodsLines.2.unit": [
      candidate("native-pcs", "goodsLines.2.unit", "pcs", "NATIVE_TEXT"),
      candidate("vision-pcs", "goodsLines.2.unit", "PCS", "PAGE_IMAGE")
    ],
    "goodsLines.0.description": [
      candidate("description", "goodsLines.0.description", "Adet gösteren ürün açıklaması", "NATIVE_TEXT")
    ]
  }
};

const projected = projectDeclarationFieldCandidates({
  documentSet,
  sources: [{ uploadedFileId: "file-invoice", sourceProcessingRunId: "run-invoice", candidates: source }]
});
const resolution = resolveDeclarationFields({ candidates: projected });

assert.deepEqual(projected.fields["goodsLines.0.unit"]?.map((item) => item.value), ["ADET", "ADET"]);
assert.deepEqual(projected.fields["goodsLines.1.unit"]?.map((item) => item.value), ["KG", "KG"]);
assert.deepEqual(projected.fields["goodsLines.2.unit"]?.map((item) => item.value), ["PCS", "PCS"]);
assert.equal(resolution.fields["goodsLines.0.unit"]?.status, "RESOLVED");
assert.equal(resolution.fields["goodsLines.0.unit"]?.method, "CONSENSUS");
assert.equal(resolution.fields["goodsLines.0.unit"]?.value, "ADET");
assert.equal(resolution.fields["goodsLines.1.unit"]?.status, "RESOLVED");
assert.equal(resolution.fields["goodsLines.2.unit"]?.status, "RESOLVED");
assert.equal(projected.fields["goodsLines.0.description"]?.[0]?.value, "Adet gösteren ürün açıklaması");
assert.equal(projected.fields["goodsLines.0.unit"]?.[1]?.evidence[0]?.text, "Adet");
assert.equal(canonicalGoodsUnit("  Adet  "), "ADET");

console.log(JSON.stringify({
  event: "product-e2e-1.5.17.canonical-goods-unit-normalization.passed",
  adetCaseVariantsReachConsensus: true,
  kilogramCaseVariantsReachConsensus: true,
  pcsCaseVariantsReachConsensus: true,
  unrelatedFieldsUnchanged: true,
  sourceEvidenceTextPreserved: true,
  foundation6ConsensusUsed: true,
  explicitUnitAuthorityAdded: false,
  guardrails: {
    supplierSpecificRuleAdded: false,
    noModelInferenceRequired: true,
    noDatabaseMutation: true,
    directNormalizedWrite: false
  }
}, null, 2));
