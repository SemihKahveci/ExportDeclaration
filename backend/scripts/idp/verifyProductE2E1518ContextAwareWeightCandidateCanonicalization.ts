import assert from "node:assert/strict";
import { DocumentType } from "../../src/common/enums/documentType.js";
import type { DeclarationDocumentSet } from "../../src/modules/idp/domain/declarationDocumentSet.types.js";
import type { FieldCandidateEnvelope } from "../../src/modules/idp/domain/fieldCandidate.types.js";
import { canonicalKilogramWeight, projectDeclarationFieldCandidates } from "../../src/modules/idp/domain/declarationFieldCandidateProjector.js";
import { resolveDeclarationFields } from "../../src/modules/idp/domain/declarationFieldResolver.js";

const documentSet: DeclarationDocumentSet = {
  version: "1", companyId: "company-1518", declarationId: "declaration-1518",
  documents: [{ logicalDocumentId:"ld-invoice", uploadedFileId:"file-invoice", type:DocumentType.INVOICE, pageStart:1, pageEnd:1, sourceProcessingRunId:"run-invoice" }],
  roles: {}
};

function candidate(candidateId:string, field:string, value:unknown, contentSource:"NATIVE_TEXT"|"PAGE_IMAGE") {
  return { candidateId, field, value, confidence:0.95, extractor:contentSource === "NATIVE_TEXT" ? "invoice-canonical-v1" : "qwen-vision",
    evidence:[{ segmentId:"segment-001", pageNumber:1, text:String(value), contentSource }] };
}

const source: FieldCandidateEnvelope = { version:"1", fields:{
  grossWeight:[candidate("vision-gross","grossWeight","2.320 Kg.","PAGE_IMAGE"), candidate("native-gross","grossWeight",2320,"NATIVE_TEXT")],
  netWeight:[candidate("vision-net","netWeight","2.250 Kg.","PAGE_IMAGE"), candidate("native-net","netWeight",2250,"NATIVE_TEXT")],
  invoiceNo:[candidate("invoice","invoiceNo","AAA2026000000009","PAGE_IMAGE")]
}};

const projected = projectDeclarationFieldCandidates({ documentSet, sources:[{ uploadedFileId:"file-invoice", sourceProcessingRunId:"run-invoice", candidates:source }] });
const resolution = resolveDeclarationFields({ candidates:projected });

assert.deepEqual(projected.fields.grossWeight?.map((c)=>c.value), [2320,2320]);
assert.deepEqual(projected.fields.netWeight?.map((c)=>c.value), [2250,2250]);
assert.equal(resolution.fields.grossWeight?.status, "RESOLVED");
assert.equal(resolution.fields.grossWeight?.method, "CONSENSUS");
assert.equal(resolution.fields.grossWeight?.value, 2320);
assert.equal(resolution.fields.netWeight?.value, 2250);
assert.equal(projected.fields.grossWeight?.[0]?.evidence[0]?.text, "2.320 Kg.");
assert.equal(projected.fields.invoiceNo?.[0]?.value, "AAA2026000000009");
assert.equal(canonicalKilogramWeight("2.320,50 Kg"), 2320.5);
assert.equal(canonicalKilogramWeight("2,320 kg"), 2.32);
assert.equal(canonicalKilogramWeight("2.32 kg"), 2.32);
assert.equal(canonicalKilogramWeight("2.320"), "2.320");
assert.equal(canonicalKilogramWeight("2.320 lb"), "2.320 lb");

console.log(JSON.stringify({
  event:"product-e2e-1.5.18.context-aware-weight-candidate-canonicalization.passed",
  explicitKilogramGroupingCanonicalized:true,
  grossAndNetWeightsReachConsensus:true,
  decimalKilogramsPreserved:true,
  unitlessAmbiguityFailsClosed:true,
  nonKilogramUnitsUnchanged:true,
  sourceEvidenceTextPreserved:true,
  unrelatedFieldsUnchanged:true,
  foundation6ConsensusUsed:true,
  guardrails:{ supplierSpecificRuleAdded:false, noModelInferenceRequired:true, noDatabaseMutation:true, directNormalizedWrite:false }
}, null, 2));
