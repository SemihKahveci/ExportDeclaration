import assert from "node:assert/strict";
import { projectVisionResponseToFieldCandidates } from "../../src/modules/idp/llm/invoiceProductionExtractionOrchestrator.js";
import { DEFAULT_DECLARATION_FIELD_TARGETS } from "../../src/modules/idp/domain/declarationFieldPromotion.service.js";
import type { InvoiceLlmExtractionResponse } from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";

const response: InvoiceLlmExtractionResponse = {
  version: "1",
  decision: "EXTRACTED" as any,
  provider: "verification",
  model: "verification",
  issues: [],
  fields: [
    { field:"invoiceNumber", value:"TXT2026000000091", confidence:1, evidence:[{ pageNumber:1, source:"PAGE_IMAGE" }] },
    { field:"seller", value:"SELLER A", confidence:1, evidence:[{ pageNumber:1, source:"PAGE_IMAGE" }] },
    { field:"buyer", value:"BUYER B", confidence:1, evidence:[{ pageNumber:1, source:"PAGE_IMAGE" }] },
    { field:"origin", value:"TR", confidence:1, evidence:[{ pageNumber:1, source:"PAGE_IMAGE" }] },
    { field:"grossKg", value:10, confidence:1, evidence:[{ pageNumber:1, source:"PAGE_IMAGE" }] },
    { field:"netKg", value:9, confidence:1, evidence:[{ pageNumber:1, source:"PAGE_IMAGE" }] },
    { field:"currency", value:"EUR", confidence:1, evidence:[{ pageNumber:1, source:"PAGE_IMAGE" }] },
    { field:"goodsLines[].hsCode", value:["610510000000"], confidence:1, evidence:[{ pageNumber:1, source:"PAGE_IMAGE" }] }
  ]
};

const projected = projectVisionResponseToFieldCandidates({ response, segmentId:"segment-001", pageNumber:1 });
const fields = projected.fields;
assert.equal(fields.invoiceNumber, undefined, "Vision-native invoiceNumber must not leak into F6.");
assert.equal(fields.invoiceNo?.[0]?.value, "TXT2026000000091");
assert.equal(fields["parties.seller.name"]?.[0]?.value, "SELLER A");
assert.equal(fields["parties.buyer.name"]?.[0]?.value, "BUYER B");
assert.equal(fields.originCountry?.[0]?.value, "TR");
assert.equal(fields.grossWeight?.[0]?.value, 10);
assert.equal(fields.netWeight?.[0]?.value, 9);
assert.equal(fields.currency?.[0]?.value, "EUR");
assert.equal(fields["goodsLines.0.hsCode"]?.[0]?.value, "610510000000");
assert.equal(DEFAULT_DECLARATION_FIELD_TARGETS.invoiceNo, "header.invoiceNo");
assert.equal(DEFAULT_DECLARATION_FIELD_TARGETS["parties.seller.name"], "parties.seller.name");
assert.equal(DEFAULT_DECLARATION_FIELD_TARGETS["parties.buyer.name"], "parties.buyer.name");
assert.equal(DEFAULT_DECLARATION_FIELD_TARGETS.originCountry, "trade.origin");
assert.equal(DEFAULT_DECLARATION_FIELD_TARGETS.grossWeight, "packageInfo.grossKg");
assert.equal(DEFAULT_DECLARATION_FIELD_TARGETS.netWeight, "packageInfo.netKg");
assert.ok(Object.values(fields).flat().every((candidate:any) => candidate.evidence.every((e:any) => e.contentSource === "PAGE_IMAGE")));

console.log(JSON.stringify({
  event:"product-e2e-1.5.8.vision-foundation6-field-contract.passed",
  invoiceNumberMappedToInvoiceNo:true,
  partyFieldsMappedToCanonicalDeclarationPaths:true,
  weightAndOriginAliasesMappedToFoundation6:true,
  goodsLineContractUnchanged:true,
  pageImageProvenancePreserved:true,
  noModelInferenceRequired:true,
  directNormalizedWrite:false
}, null, 2));
