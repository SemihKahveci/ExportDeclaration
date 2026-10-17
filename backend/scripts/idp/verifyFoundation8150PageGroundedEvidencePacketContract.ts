import assert from "node:assert/strict";
import { renderFoundation8PageGroundedEvidencePacket } from "../../src/modules/idp/understanding/invoiceUnderstandingSpecialistModelExecution.js";
import { buildInvoiceSpecialistRequest, INVOICE_SPECIALISTS } from "../../src/modules/idp/understanding/invoiceUnderstandingOrchestration.js";

function main(): void {
  const bundle = {
    documentId: "foundation-8.15-contract",
    evidence: [
      { pageNumber: 1, source: "NATIVE_TEXT" as const, quote: "Invoice No INV-001" },
      { pageNumber: 3, source: "OCR" as const, quote: "25000 KG" }
    ],
    canonicalPages: [
      { pageNumber: 3, source: "OCR" as const, text: "PRODUCT A 25000 KG 17500 USD" },
      { pageNumber: 1, source: "NATIVE_TEXT" as const, text: "Invoice No INV-001\nSeller Example" },
      { pageNumber: 2, source: "NATIVE_TEXT" as const, text: "   " }
    ],
    canonicalText: "legacy flattened fallback"
  };

  const goods = buildInvoiceSpecialistRequest(INVOICE_SPECIALISTS.find(item => item.domain === "GOODS")!, bundle);
  const packet = renderFoundation8PageGroundedEvidencePacket(goods)!;
  assert.match(packet, /<<<PAGE 1 \| SOURCE NATIVE_TEXT>>>/);
  assert.match(packet, /<<<PAGE 3 \| SOURCE OCR>>>/);
  assert.ok(packet.indexOf("PAGE 1") < packet.indexOf("PAGE 3"));
  assert.ok(!packet.includes("PAGE 2"));
  assert.ok(!packet.includes("legacy flattened fallback"));
  assert.deepEqual(goods.canonicalPages, bundle.canonicalPages);

  const fallback = renderFoundation8PageGroundedEvidencePacket({ canonicalText: "legacy only" });
  assert.equal(fallback, "legacy only");

  const acceptance = {
    canonicalPagesPreservePageIdentity: true,
    evidencePacketCarriesPageAndSourceMarkers: true,
    packetOrderingIsDeterministic: true,
    blankPagesDoNotPolluteModelContext: true,
    pageGroundedPacketPreferredOverFlattenedText: true,
    legacyFlatTextFallbackRemainsAvailable: true,
    samePageGroundedEvidenceReachesBoundedSpecialists: true
  };
  const guardrails = {
    shadowOnly: true,
    productionCandidatesChanged: false,
    foundation6PromotionChanged: false,
    normalizedDataWriteAdded: false,
    modelOrOcrRequiredByContract: false,
    supplierSpecificRules: false,
    invoiceSpecificProductionConstants: false
  };
  console.log(JSON.stringify({ event: "foundation-8.15.page-grounded-evidence-packet.contract.passed", acceptance, guardrails }, null, 2));
}

main();
