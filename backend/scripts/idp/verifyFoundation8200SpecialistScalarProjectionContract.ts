import assert from "node:assert/strict";
import fs from "node:fs";
import { InvoiceLlmExtractionDecision, type InvoiceLlmExtractionResponse } from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";
import { projectSpecialistModelAuditToInvoiceUnderstanding } from "../../src/modules/idp/understanding/invoiceUnderstandingSpecialistProjection.js";
import { bridgeReconciledFoundation8ToCandidates } from "../../src/modules/idp/understanding/invoiceUnderstandingSpecialistCandidateBridge.js";
import type { Foundation8SpecialistModelAuditItem, Foundation8SpecialistModelExecutionAudit } from "../../src/modules/idp/understanding/invoiceUnderstandingSpecialistModelExecution.js";
import type { Foundation8SpecialistReconciliationAudit } from "../../src/modules/idp/understanding/invoiceUnderstandingSpecialistReconciliation.js";
import type { InvoiceSpecialistDomain } from "../../src/modules/idp/understanding/invoiceUnderstandingOrchestration.js";

const ev = (quote: string) => [{ pageNumber: 1, source: "NATIVE_TEXT" as const, quote }];
const response = (fields: InvoiceLlmExtractionResponse["fields"]): InvoiceLlmExtractionResponse => ({
  version: "1", decision: InvoiceLlmExtractionDecision.PARTIAL, fields, issues: [], model: "fake", provider: "fake"
});
function item(domain: InvoiceSpecialistDomain, fields: InvoiceLlmExtractionResponse["fields"]): Foundation8SpecialistModelAuditItem {
  return { domain, skillName: `invoice-${domain.toLowerCase()}`, skillVersion: "1", requestedFields: [], status: "COMPLETED", returnedFieldCount: fields.length, acceptedOwnedFieldCount: fields.length, rejectedOutOfDomainFields: [], response: response(fields) };
}

const audit: Foundation8SpecialistModelExecutionAudit = {
  version: "8.10.0", mode: "SHADOW_ONLY", productionCandidateMutation: false, modelCallsAttempted: 4,
  specialists: [
    item("PARTIES", []), item("COMMERCIAL", []),
    item("GOODS", [
      { field: "goodsTable.expectedRowCount", value: { value: "1" }, confidence: .9, evidence: ev("1") },
      { field: "goodsLines.0.productCode", value: { value: "CODE-X", confidence: .95, evidence: ev("CODE-X") }, confidence: .95, evidence: ev("CODE-X") },
      { field: "goodsLines.0.description", value: { value: "ITEM X" }, confidence: .95, evidence: ev("ITEM X") },
      { field: "goodsLines.0.hsCode", value: { value: "123456789012" }, confidence: .95, evidence: ev("123456789012") },
      { field: "goodsLines.0.quantity", value: { value: "1,0" }, confidence: .95, evidence: ev("1,0") },
      { field: "goodsLines.0.unit", value: { value: "Adet" }, confidence: .95, evidence: ev("Adet") },
      { field: "goodsLines.0.unitPrice", value: { value: "560 EUR" }, confidence: .95, evidence: ev("560 EUR") },
      { field: "goodsLines.0.lineTotal", value: { value: "560,00 EUR" }, confidence: .95, evidence: ev("560,00 EUR") },
      { field: "goodsLines.0.origin", value: { value: "TR" }, confidence: .95, evidence: ev("TR") }
    ]),
    item("LOGISTICS", [])
  ]
};

const understanding = projectSpecialistModelAuditToInvoiceUnderstanding({ documentId: "fixture", audit });
const row = understanding.goodsTable.rows[0]!;
assert.equal(understanding.goodsTable.expectedRowCount, 1);
assert.equal(row.productCode?.value, "CODE-X");
assert.equal(row.quantity?.value, 1);
assert.equal(row.unitPrice?.value, 560);
assert.equal(row.lineTotal?.value, 560);

const reconciliation = { action: "ACCEPT", result: { action: "ACCEPT", understanding, issues: [], recoveryRequests: [] } } as unknown as Foundation8SpecialistReconciliationAudit;
const bridged = bridgeReconciledFoundation8ToCandidates({ segmentId: "segment-001", reconciliation, promotableDomains: new Set(["GOODS"]) });
assert.equal(bridged.fields["goodsLines.0.quantity"]?.[0]?.value, 1);
assert.equal(bridged.fields["goodsLines.0.unitPrice"]?.[0]?.value, 560);
assert.equal(bridged.fields["goodsLines.0.lineTotal"]?.[0]?.value, 560);

const projection = fs.readFileSync("backend/src/modules/idp/understanding/invoiceUnderstandingSpecialistProjection.ts", "utf8");
const guardrails = {
  noSupplierSpecificRules: !/CELIKEL|VED2026|YEM2026|VOLTA|NINGBO|DERMETERNAL|P0087/i.test(projection),
  noGoldenRuntimeImport: !/goldenCorpus|golden\/foundation8/i.test(projection),
  noDirectNormalizedWrite: !/normalizedData\s*=|\.normalizedData\s*=/.test(projection),
  evidenceStillRequired: projection.includes("if (!field || !field.evidence.length) return undefined;")
};
Object.entries(guardrails).forEach(([name, ok]) => assert.equal(ok, true, name));
console.log(JSON.stringify({
  event: "foundation-8.20.specialist-scalar-projection.contract.passed",
  acceptance: {
    wrappedScalarValuesAreUnwrapped: true,
    localeNumericStringsAreNormalized: true,
    completeAtomicGoodsRowSurvivesProjection: true,
    completeAtomicGoodsRowBridgesToFoundation6Candidates: true
  },
  guardrails
}, null, 2));
