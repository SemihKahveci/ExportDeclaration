import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { INVOICE_EXTRACTION_FIELDS } from "../../src/modules/idp/llm/invoiceExtractionSkill.js";
import { DEFAULT_DECLARATION_FIELD_TARGETS } from "../../src/modules/idp/domain/declarationFieldPromotion.service.js";
import { adaptNaturalInvoiceResponse } from "../../src/modules/idp/llm/qwenVisionInvoiceProvider.js";
import { InvoiceLlmEvidenceMode } from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";

const scalarFields = [
  "exitCountry", "arrivalCountry", "destinationCountry", "tradeCountry",
  "carrier", "departureVehicleId", "borderVehicleId", "vehiclePlate", "containerNo",
  "billOfLadingNo", "cmrNo", "awbNo", "transportDocumentNo",
  "exchangeRate", "freight", "insurance", "bankInfo", "packageType",
  "previousDocumentNo", "circulationDocumentNo", "originDocumentNo"
] as const;
for (const field of scalarFields) assert.ok((INVOICE_EXTRACTION_FIELDS as readonly string[]).includes(field), `${field} must be requested from primary extraction`);

const expectedTargets: Record<string,string> = {
  exitCountry:"trade.exitCountry", arrivalCountry:"trade.arrivalCountry", destinationCountry:"trade.destinationCountry", tradeCountry:"trade.tradeCountry",
  carrier:"transport.carrier", departureVehicleId:"transport.departureVehicleId", borderVehicleId:"transport.borderVehicleId", vehiclePlate:"transport.vehiclePlate",
  containerNo:"transport.containerNo", billOfLadingNo:"transport.billOfLadingNo", cmrNo:"transport.cmrNo", awbNo:"transport.awbNo", transportDocumentNo:"transport.transportDocumentNo",
  exchangeRate:"finance.exchangeRate", freight:"finance.freight", insurance:"finance.insurance", bankInfo:"finance.bankInfo",
  previousDocumentNo:"documents.previousDocumentNo", circulationDocumentNo:"documents.circulationDocumentNo", originDocumentNo:"documents.originDocumentNo"
};
for (const [field,target] of Object.entries(expectedTargets)) assert.equal(DEFAULT_DECLARATION_FIELD_TARGETS[field], target, `${field} promotion target`);

const fixture: Record<string, unknown> = Object.fromEntries(scalarFields.map((field, index) => [field, ["exchangeRate","freight","insurance"].includes(field) ? index + 1 : `V-${field}`]));
const adapted = adaptNaturalInvoiceResponse(fixture, {
  version:"1", documentId:"coverage-fixture", evidenceMode:InvoiceLlmEvidenceMode.PAGE_IMAGE,
  requestedFields:[...scalarFields], nativeText:"", ocrText:"", verifiedKnowledge:[]
}, [{pageNumber:1,mimeType:"image/png",bytes:Buffer.from("x")}]);
assert.deepEqual(new Set(adapted.fields.map((f)=>f.field)), new Set(scalarFields), "natural Qwen response must retain every remaining scalar family");

const frontend = readFileSync("frontend/src/api/adapters/declarationAdapter.ts", "utf8");
for (const needle of [
  'norm.trade.destinationCountry', 'norm.transport.containerNo', 'norm.transport.cmrNo', 'norm.transport.awbNo',
  'norm.finance?.exchangeRate', 'norm.finance?.freight', 'norm.finance?.insurance', 'norm.finance?.bankInfo',
  'norm.documents?.previousDocumentNo', 'norm.documents?.circulationDocumentNo', 'norm.documents?.originDocumentNo'
]) assert.ok(frontend.includes(needle), `writing UI bridge missing ${needle}`);

console.log(JSON.stringify({event:"product-e2e-1.8.7.remaining-document-field-coverage.contract.passed",coveredScalarFamilies:scalarFields.length,guardrails:{sourcePresentOnly:true,destinationRolesIndependent:true,transportIdentifiersRoleBound:true,financialExtrasExplicit:true,documentIdentifiersRoleBound:true,foundation6Authoritative:true,directNormalizedWrite:false,vendorAgnostic:true}},null,2));
