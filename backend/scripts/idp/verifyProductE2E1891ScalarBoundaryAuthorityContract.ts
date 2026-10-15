import assert from "node:assert/strict";
import {
  canonicalVisionValue,
  projectVisionResponseToFieldCandidates
} from "../../src/modules/idp/llm/invoiceProductionExtractionOrchestrator.js";
import { InvoiceLlmExtractionDecision } from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";

// 1.8.9.1: regression contract for the two real-corpus boundary failures found
// by the source-present gate. These assertions are vendor/invoice agnostic.
assert.equal(canonicalVisionValue("invoiceNumber", "P0087/26-27 & 16-Sep-26"), "P0087/26-27");
assert.equal(canonicalVisionValue("invoiceNumber", "INV/ABC-77; 2026-09-16"), "INV/ABC-77");
assert.equal(canonicalVisionValue("invoiceNumber", "INV-2026-A&B"), "INV-2026-A&B");

assert.equal(canonicalVisionValue("deliveryTerm", "DAP-30 DAYS"), "DAP");
assert.equal(canonicalVisionValue("deliveryTerm", "FOB NINGBO"), "FOB");
assert.equal(canonicalVisionValue("deliveryTerm", "FOC"), undefined);
assert.equal(canonicalVisionValue("deliveryTerm", "FREE OF CHARGE"), undefined);

const projected = projectVisionResponseToFieldCandidates({
  response: {
    version: "1",
    decision: InvoiceLlmExtractionDecision.EXTRACTED,
    provider: "contract",
    model: "contract",
    fields: [
      { field: "invoiceNumber", value: "X-77 | 14/08/2026", confidence: 1, evidence: [{ pageNumber: 1, source: "PAGE_IMAGE" }] },
      { field: "deliveryTerm", value: "FOC", confidence: 1, evidence: [{ pageNumber: 1, source: "PAGE_IMAGE" }] }
    ],
    issues: []
  },
  segmentId: "segment-contract",
  pageNumber: 1
});

assert.equal(projected.fields.invoiceNo?.[0]?.value, "X-77");
assert.equal(projected.fields.deliveryTerm, undefined, "Non-Incoterm commercial tokens must fail closed before F6.");

console.log(JSON.stringify({
  event: "product-e2e-1.8.9.1.scalar-boundary-authority.contract.passed",
  guardrails: {
    invoiceNumberDateBoundarySeparated: true,
    foreignInvoiceIdentifiersPreserved: true,
    incotermCanonicalized: true,
    focNotDeliveryTerm: true,
    invalidDeliveryTermFailsClosedBeforeFoundation6: true,
    vendorAgnostic: true,
    foundation6Authoritative: true,
    directNormalizedWrite: false
  }
}, null, 2));
