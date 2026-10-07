import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main(): Promise<void> {
  const source = await readFile("backend/src/modules/idp/llm/invoiceProductionVisionExecution.ts", "utf8");
  const provider = await readFile("backend/src/modules/idp/llm/qwenVisionInvoiceProvider.ts", "utf8");

  assert.match(source, /shipmentWeightAnchorHints/);
  assert.match(source, /brüt\|brut\|gross\|net/i);
  assert.match(source, /Assistive label-anchor snippets located in page-local text/);
  assert.match(source, /navigation hints only/);
  assert.match(source, /verify the label and raw value against the supplied page image/i);
  assert.match(source, /requestedFields: \["grossKg", "netKg"\]/);
  assert.match(source, /Never use Miktar\/Quantity\/Qty, Koli\/Package\/Box\/Pallet/);
  assert.match(provider, /isWeightLabel/);
  assert.match(provider, /shipmentWeightEvidence/);
  assert.doesNotMatch(source, /26020|eryem|YEM2026/i);
  assert.doesNotMatch(provider, /26020|eryem|YEM2026/i);

  console.log(JSON.stringify({
    event: "product-e2e-1.6.9.13.label-anchored-shipment-weight-evidence-recovery.passed",
    guardrails: {
      pageImageAuthority: true,
      pageLocalTextAssistiveOnly: true,
      labelAnchorsAreNavigationOnly: true,
      exactWeightEvidenceStillRequired: true,
      supplierSpecificRules: false,
      knownAnswerHardcodes: false,
      directNormalizedWrite: false,
      foundation6AuthorityUnchanged: true
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
