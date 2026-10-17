import assert from "node:assert/strict";
import { InvoiceLlmExtractionDecision, type InvoiceLlmExtractionResponse } from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";
import { validateInvoiceUnderstanding } from "../../src/modules/idp/understanding/invoiceUnderstandingContract.js";
import { projectSpecialistModelAuditToInvoiceUnderstanding } from "../../src/modules/idp/understanding/invoiceUnderstandingSpecialistProjection.js";
import type { Foundation8SpecialistModelExecutionAudit, Foundation8SpecialistModelAuditItem } from "../../src/modules/idp/understanding/invoiceUnderstandingSpecialistModelExecution.js";
import type { InvoiceSpecialistDomain } from "../../src/modules/idp/understanding/invoiceUnderstandingOrchestration.js";

const evidence = (quote: string) => [{ pageNumber: 1, source: "NATIVE_TEXT" as const, quote }];
const response = (fields: InvoiceLlmExtractionResponse["fields"]): InvoiceLlmExtractionResponse => ({
  version: "1", decision: InvoiceLlmExtractionDecision.EXTRACTED, fields, issues: [], model: "fake", provider: "fake"
});
function item(domain: InvoiceSpecialistDomain, fields: InvoiceLlmExtractionResponse["fields"]): Foundation8SpecialistModelAuditItem {
  return { domain, skillName: `invoice-${domain.toLowerCase()}`, skillVersion: "1", requestedFields: [], status: "COMPLETED", returnedFieldCount: fields.length, acceptedOwnedFieldCount: fields.length, rejectedOutOfDomainFields: [], response: response(fields) };
}

const audit: Foundation8SpecialistModelExecutionAudit = {
  version: "8.10.0", mode: "SHADOW_ONLY", productionCandidateMutation: false, modelCallsAttempted: 4,
  specialists: [
    item("PARTIES", [
      { field: "parties.seller.name", value: "SELLER", confidence: 0.99, evidence: evidence("SELLER") },
      { field: "parties.buyer.name", value: "BUYER", confidence: 0.99, evidence: evidence("BUYER") }
    ]),
    item("COMMERCIAL", [
      { field: "invoiceNo", value: "INV-1", confidence: 0.99, evidence: evidence("INV-1") },
      { field: "totalAmount", value: 17500, confidence: 0.99, evidence: evidence("TOTAL 17500") }
    ]),
    item("GOODS", [
      { field: "goodsLines.0.description", value: "GOODS A", confidence: 0.98, evidence: evidence("GOODS A 25000 KG 17500") },
      { field: "goodsLines.0.quantity", value: 25000, confidence: 0.98, evidence: evidence("GOODS A 25000 KG 17500") },
      { field: "goodsLines.0.unit", value: "KG", confidence: 0.98, evidence: evidence("GOODS A 25000 KG 17500") },
      { field: "goodsLines.0.lineTotal", value: 17500, confidence: 0.98, evidence: evidence("GOODS A 25000 KG 17500") },
      // Deliberate HS-only skeleton. It may materialize as a row, but it must never count as complete.
      { field: "goodsLines.1.hsCode", value: "123456789012", confidence: 0.95, evidence: evidence("123456789012") }
    ]),
    item("LOGISTICS", [
      { field: "totalPackage", value: 1250, confidence: 0.97, evidence: evidence("1250 KOLI") },
      { field: "packageType", value: "KOLI", confidence: 0.97, evidence: evidence("1250 KOLI") }
    ])
  ]
};

const understanding = projectSpecialistModelAuditToInvoiceUnderstanding({ documentId: "foundation-8.11-contract", audit });
const validation = validateInvoiceUnderstanding(understanding);

assert.equal(understanding.documentIdentity.invoiceNo?.value, "INV-1");
assert.equal(understanding.commercialTerms.totalAmount?.value, 17500);
assert.equal(understanding.packageSummary.count?.value, 1250);
assert.equal(understanding.goodsTable.rows[0]?.quantity?.value, 25000);
assert.equal(understanding.goodsTable.rows[0]?.lineTotal?.value, 17500);
assert.equal(understanding.goodsTable.rows[0]?.rowEvidence.length! > 0, true);
assert.notEqual(understanding.goodsTable.rows[0]?.rowId, "goodsLines.0");
assert.equal(validation.materializedGoodsRowCount, 2);
assert.equal(validation.completeGoodsRowCount, 1);
assert.equal(validation.goodsTableComplete, false);
assert.equal(understanding.packageSummary.count?.value === understanding.goodsTable.rows[0]?.quantity?.value, false);

const before = JSON.stringify(audit);
projectSpecialistModelAuditToInvoiceUnderstanding({ documentId: "foundation-8.11-contract", audit });
assert.equal(JSON.stringify(audit), before);

console.log(JSON.stringify({
  event: "foundation-8.11.specialist-atomic-projection.contract.passed",
  acceptance: {
    specialistFieldsProjectIntoInvoiceUnderstanding: true,
    goodsFieldsBecomeAtomicRowsWithRowEvidence: true,
    hsOnlySkeletonCannotCountAsCompleteCommercialRow: true,
    packageCountRemainsSeparateFromGoodsQuantity: true,
    commercialTotalRemainsSeparateFromGoodsLineTotal: true,
    rowIdentityIsNotRawFieldPath: true,
    projectionDoesNotMutateSpecialistAudit: true
  },
  guardrails: {
    shadowOnly: true,
    productionCandidatesChanged: false,
    foundation6PromotionChanged: false,
    normalizedDataWriteAdded: false,
    goldenCorpusImportedAtRuntime: false,
    supplierSpecificRules: false,
    invoiceSpecificProductionConstants: false,
    modelOrOcrRequiredByContract: false
  }
}, null, 2));
