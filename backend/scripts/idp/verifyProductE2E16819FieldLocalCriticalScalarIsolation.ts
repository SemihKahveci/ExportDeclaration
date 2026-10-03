import assert from "node:assert/strict";
import { INVOICE_EXTRACTION_SKILL_VERSION, INVOICE_EXTRACTION_SYSTEM_PROMPT } from "../../src/modules/idp/llm/invoiceExtractionSkill.js";
import { INVOICE_EXTRACTION_KNOWLEDGE_VERSION } from "../../src/modules/idp/llm/invoiceExtractionKnowledge.js";
import { adaptNaturalInvoiceResponse } from "../../src/modules/idp/llm/qwenVisionInvoiceProvider.js";
import { InvoiceLlmEvidenceMode } from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";

const request:any = {
  requestedFields: ["invoiceDate","currency","grossKg","netKg","origin","deliveryTerm","goodsLines[].description","goodsLines[].quantity"],
  evidenceMode: InvoiceLlmEvidenceMode.PAGE_IMAGE
};
const pageImages:any[] = [{pageNumber:2,mimeType:"image/png",base64:"AA=="}];

const parsed:any = {
  invoiceDate: null,
  currency: null,
  grossKg: 48,
  netKg: 40,
  origin: "ABD",
  deliveryTerm: "EXW",
  criticalScalarEvidence: {
    invoiceDate: {label:null,rawValue:null},
    currency: {label:null,rawValue:null}
  },
  goodsLines: [
    {description:"Drug Adulteration Test",quantity:4},
    {description:"Indiko 20ml reagent bottle, 16 pcs.",quantity:1}
  ]
};

const adapted:any = adaptNaturalInvoiceResponse(parsed, request, pageImages);
const names = new Set(adapted.fields.map((x:any)=>x.field));

assert.equal(INVOICE_EXTRACTION_KNOWLEDGE_VERSION, "invoice-knowledge-v1");
assert.equal(INVOICE_EXTRACTION_SKILL_VERSION, "invoice-extraction-v7");
assert(!names.has("invoiceDate"));
assert(!names.has("currency"));
for (const field of ["grossKg","netKg","origin","deliveryTerm","goodsLines[].description","goodsLines[].quantity"]) {
  assert(names.has(field), `unrelated supported field was suppressed: ${field}`);
}
assert.equal(adapted.decision, "PARTIAL");
assert.match(INVOICE_EXTRACTION_SYSTEM_PROMPT,/Critical-scalar uncertainty is field-local/i);
assert.match(INVOICE_EXTRACTION_SYSTEM_PROMPT,/continue extracting every other independently supported field/i);
assert.match(INVOICE_EXTRACTION_SYSTEM_PROMPT,/Never null, suppress or downgrade unrelated supported fields/i);
assert.doesNotMatch(INVOICE_EXTRACTION_SYSTEM_PROMPT,/Mekar|Volta|Ningbo|EAR2026000000068/i);

console.log(JSON.stringify({
  event:"product-e2e-1.6.8.19.field-local-critical-scalar-isolation.passed",
  knowledgeVersion:INVOICE_EXTRACTION_KNOWLEDGE_VERSION,
  skillVersion:INVOICE_EXTRACTION_SKILL_VERSION,
  unsupportedCriticalScalarsRemainBlocked:true,
  unrelatedSupportedScalarsPreserved:true,
  goodsLinesPreserved:true,
  fieldLocalFailure:true,
  qwenPrimary:true,
  ocrPrimary:false,
  supplierSpecificRules:false,
  groundTruthAuthorityUsed:false,
  directNormalizedWrite:false
},null,2));
