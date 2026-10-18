import assert from "node:assert/strict";
import fs from "node:fs";
import { InvoiceLlmExtractionDecision, type InvoiceLlmExtractionResponse } from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";
import { projectSpecialistModelAuditToInvoiceUnderstanding } from "../../src/modules/idp/understanding/invoiceUnderstandingSpecialistProjection.js";
import { validateInvoiceUnderstanding } from "../../src/modules/idp/understanding/invoiceUnderstandingContract.js";
import { bridgeReconciledFoundation8ToCandidates } from "../../src/modules/idp/understanding/invoiceUnderstandingSpecialistCandidateBridge.js";
import type { Foundation8SpecialistModelAuditItem, Foundation8SpecialistModelExecutionAudit } from "../../src/modules/idp/understanding/invoiceUnderstandingSpecialistModelExecution.js";
import type { Foundation8SpecialistReconciliationAudit } from "../../src/modules/idp/understanding/invoiceUnderstandingSpecialistReconciliation.js";
import type { InvoiceSpecialistDomain } from "../../src/modules/idp/understanding/invoiceUnderstandingOrchestration.js";

const ev = (quote: string) => [{ pageNumber: 1, source: "NATIVE_TEXT" as const, quote }];
const f = (field: string, value: unknown, quote: string) => ({ field, value, confidence: .95, evidence: ev(quote) });
const response = (fields: InvoiceLlmExtractionResponse["fields"]): InvoiceLlmExtractionResponse => ({
  version: "1", decision: InvoiceLlmExtractionDecision.PARTIAL, fields, issues: [], model: "fixture", provider: "fixture"
});
function item(domain: InvoiceSpecialistDomain, fields: InvoiceLlmExtractionResponse["fields"]): Foundation8SpecialistModelAuditItem {
  return { domain, skillName: `invoice-${domain.toLowerCase()}`, skillVersion: "1", requestedFields: [], status: "COMPLETED", returnedFieldCount: fields.length, acceptedOwnedFieldCount: fields.length, rejectedOutOfDomainFields: [], response: response(fields) };
}

const audit: Foundation8SpecialistModelExecutionAudit = {
  version: "8.10.0", mode: "SHADOW_ONLY", productionCandidateMutation: false, modelCallsAttempted: 4,
  specialists: [
    item("PARTIES", [
      f("parties.seller.name", { value: "SELLER A" }, "SELLER A"),
      f("parties.buyer.name", { value: "BUYER B" }, "BUYER B")
    ]),
    item("COMMERCIAL", [
      f("invoiceNo", { value: "INV-42" }, "INV-42"),
      f("currency", { value: "EUR" }, "EUR"),
      f("totalAmount", { value: "560,00 EUR" }, "560,00 EUR")
    ]),
    item("GOODS", [
      f("goodsTable.expectedRowCount", { value: "1" }, "1"),
      f("goodsLines.0.productCode", { value: "CODE-X" }, "CODE-X"),
      f("goodsLines.0.description", { value: "ITEM X" }, "ITEM X"),
      f("goodsLines.0.hsCode", { value: "123456789012" }, "123456789012"),
      f("goodsLines.0.quantity", { value: "1,0" }, "1,0"),
      f("goodsLines.0.unit", { value: "Adet" }, "Adet"),
      f("goodsLines.0.unitPrice", { value: "560 EUR" }, "560 EUR"),
      f("goodsLines.0.lineTotal", { value: "560,00 EUR" }, "560,00 EUR")
    ]),
    item("LOGISTICS", [
      f("deliveryTerm", { value: "EXW" }, "EXW"),
      f("grossWeight", { value: "87 KG" }, "87 KG"),
      f("totalPackage", { value: "2" }, "2")
    ])
  ]
};

const understanding = projectSpecialistModelAuditToInvoiceUnderstanding({ documentId: "fixture", audit });
assert.equal(understanding.parties.seller?.name?.value, "SELLER A");
assert.equal(understanding.documentIdentity.invoiceNo?.value, "INV-42");
assert.equal(understanding.commercialTerms.totalAmount?.value, 560);
assert.equal(understanding.logistics.deliveryTerm?.value, "EXW");
assert.equal(understanding.logistics.grossWeight?.value, 87);
assert.equal(understanding.packageSummary.count?.value, 2);
assert.equal(understanding.goodsTable.rows[0]?.quantity?.value, 1);
assert.equal(understanding.goodsTable.rows[0]?.unitPrice?.value, 560);
assert.equal(understanding.goodsTable.rows[0]?.lineTotal?.value, 560);
assert.equal(validateInvoiceUnderstanding(understanding).valid, true);

const reconciliation = { action: "ACCEPT", result: { action: "ACCEPT", understanding, issues: [], recoveryRequests: [] } } as unknown as Foundation8SpecialistReconciliationAudit;
const bridged = bridgeReconciledFoundation8ToCandidates({ segmentId: "segment-001", reconciliation, promotableDomains: new Set(["PARTIES", "COMMERCIAL", "GOODS", "LOGISTICS"]) });
for (const field of ["parties.seller.name", "invoiceNo", "totalAmount", "deliveryTerm", "grossWeight", "totalPackage", "goodsLines.0.quantity", "goodsLines.0.unitPrice", "goodsLines.0.lineTotal"]) {
  assert.ok(bridged.fields[field]?.length, `missing bridged field ${field}`);
}

const noGoodsAudit: Foundation8SpecialistModelExecutionAudit = {
  ...audit,
  specialists: audit.specialists.map(s => s.domain === "GOODS" ? item("GOODS", []) : s)
};
const noGoods = projectSpecialistModelAuditToInvoiceUnderstanding({ documentId: "fixture-no-goods", audit: noGoodsAudit });
const noGoodsValidation = validateInvoiceUnderstanding(noGoods);
assert.equal(noGoodsValidation.valid, true, "an absent GOODS domain must not invalidate independent domains");
assert.equal(noGoodsValidation.goodsTableComplete, false, "zero materialized goods rows are incomplete, not falsely complete");

const provider = fs.readFileSync("backend/src/modules/idp/llm/qwenTextInvoiceProvider.ts", "utf8");
const projection = fs.readFileSync("backend/src/modules/idp/understanding/invoiceUnderstandingSpecialistProjection.ts", "utf8");
const contract = fs.readFileSync("backend/src/modules/idp/understanding/invoiceUnderstandingContract.ts", "utf8");
const guardrails = {
  structuredValueIsPrimitive: provider.includes('value: { anyOf: [{ type: "string" }, { type: "number" }] }'),
  longQuoteGroundingIsBounded: provider.includes("orderedTokenCoverage") && provider.includes(">= 0.9") && provider.includes("quoteTokens.length < 6"),
  wrappersHandledAcrossAllDomains: projection.includes('totalAmount: groundedNumber') && projection.includes('name: groundedString(parties.get("parties.seller.name"))') && projection.includes('grossWeight: groundedNumber'),
  emptyGoodsDoesNotInvalidateDocument: contract.includes("if (hasGoodsMaterial) validateEvidence"),
  zeroGoodsIsNotComplete: contract.includes("materializedGoodsRowCount > 0"),
  supplierSpecificRules: /CELIKEL|VED2026|YEM2026|VOLTA|NINGBO|DERMETERNAL|P0087/i.test(provider + projection + contract),
  invoiceSpecificProductionConstants: /VXA2026000000035|YEM2026000000037/.test(provider + projection + contract),
  directNormalizedWrite: /normalizedData\s*=|\.normalizedData\s*=/.test(provider + projection + contract)
};
assert.equal(guardrails.structuredValueIsPrimitive, true);
assert.equal(guardrails.longQuoteGroundingIsBounded, true);
assert.equal(guardrails.wrappersHandledAcrossAllDomains, true);
assert.equal(guardrails.emptyGoodsDoesNotInvalidateDocument, true);
assert.equal(guardrails.zeroGoodsIsNotComplete, true);
assert.equal(guardrails.supplierSpecificRules, false);
assert.equal(guardrails.invoiceSpecificProductionConstants, false);
assert.equal(guardrails.directNormalizedWrite, false);

console.log(JSON.stringify({
  event: "foundation-8.21.specialist-evidence-projection-bundle.contract.passed",
  acceptance: {
    typedWrappersProjectAcrossAllDomains: true,
    goodsNumericWrappersRemainAtomic: true,
    independentDomainsSurviveMissingGoods: true,
    emptyGoodsCannotMasqueradeAsComplete: true,
    specialistSchemaForcesPrimitiveValues: true,
    longContextEvidenceToleranceIsStrictlyBounded: true,
    allDomainsBridgeToFoundation6Candidates: true
  },
  guardrails
}, null, 2));
