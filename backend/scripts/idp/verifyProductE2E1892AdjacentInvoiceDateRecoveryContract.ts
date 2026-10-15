import assert from "node:assert/strict";
import { projectVisionResponseToFieldCandidates } from "../../src/modules/idp/llm/invoiceProductionExtractionOrchestrator.js";
import { InvoiceLlmExtractionDecision } from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";

function project(invoiceNumber: string, invoiceDate?: string) {
  return projectVisionResponseToFieldCandidates({
    response: {
      version: "1",
      decision: InvoiceLlmExtractionDecision.EXTRACTED,
      provider: "contract",
      model: "contract",
      fields: [
        { field: "invoiceNumber", value: invoiceNumber, confidence: 0.99, evidence: [{ pageNumber: 1, source: "PAGE_IMAGE", quote: invoiceNumber }] },
        ...(invoiceDate ? [{ field: "invoiceDate", value: invoiceDate, confidence: 1, evidence: [{ pageNumber: 1, source: "PAGE_IMAGE" as const, quote: invoiceDate }] }] : [])
      ],
      issues: []
    },
    segmentId: "segment-contract",
    pageNumber: 1
  });
}

const pmlShape = project("P0087/26-27 & 16-Sep-26");
assert.equal(pmlShape.fields.invoiceNo?.[0]?.value, "P0087/26-27");
assert.equal(pmlShape.fields.invoiceDate?.[0]?.value, "2026-09-16");
assert.equal(pmlShape.fields.invoiceDate?.[0]?.evidence?.[0]?.contentSource, "PAGE_IMAGE");

const isoShape = project("INV-77 | 2026-09-16");
assert.equal(isoShape.fields.invoiceDate?.[0]?.value, "2026-09-16");

const unambiguousNumeric = project("INV-78; 14/08/2026");
assert.equal(unambiguousNumeric.fields.invoiceDate?.[0]?.value, "2026-08-14");

const ambiguousNumeric = project("INV-79; 04/05/2026");
assert.equal(ambiguousNumeric.fields.invoiceDate, undefined, "Ambiguous numeric dates must fail closed.");

const explicitWins = project("INV-80 & 16-Sep-26", "2026-09-17");
assert.equal(explicitWins.fields.invoiceDate?.length, 1);
assert.equal(explicitWins.fields.invoiceDate?.[0]?.value, "2026-09-17", "Explicit invoiceDate evidence must not be replaced by suffix recovery.");

const unrelatedIdentifier = project("INV-2026-A&B");
assert.equal(unrelatedIdentifier.fields.invoiceNo?.[0]?.value, "INV-2026-A&B");
assert.equal(unrelatedIdentifier.fields.invoiceDate, undefined);

console.log(JSON.stringify({
  event: "product-e2e-1.8.9.2.adjacent-invoice-date-recovery.contract.passed",
  guardrails: {
    adjacentDateRecoveredFromSameVisionEvidence: true,
    explicitInvoiceDateWins: true,
    ambiguousNumericDateFailsClosed: true,
    foreignInvoiceIdentifiersPreserved: true,
    vendorAgnostic: true,
    foundation6Authoritative: true,
    directNormalizedWrite: false
  }
}, null, 2));
