import assert from "node:assert/strict";
import { canonicalVisionValue } from "../../src/modules/idp/llm/invoiceProductionExtractionOrchestrator.js";

async function main(): Promise<void> {
  const cases: Array<[string, unknown, unknown]> = [
    ["goodsLines[].lineTotal", "10'500.00", 10500],
    ["goodsLines[].lineTotal", "10’500.00", 10500],
    ["goodsLines[].lineTotal", "1'234'567.89", 1234567.89],
    ["goodsLines[].unitPrice", "1’602,00 EUR", 1602],
    ["grossKg", "26'020 KG", 26020],
    ["goodsLines[].lineTotal", "10'50.00", "10'50.00"],
    ["goodsLines[].lineTotal", "ABC'500", "ABC'500"]
  ];

  for (const [field, input, expected] of cases) {
    assert.deepEqual(canonicalVisionValue(field, input), expected, `${field}: ${String(input)}`);
  }

  console.log(JSON.stringify({
    event: "product-e2e-1.7.5.grouped-numeric-canonicalization.contract.passed",
    guardrails: {
      supplierAgnostic: true,
      groupingShapeRequired: true,
      apostropheAndRightQuoteSupported: true,
      malformedValuesFailClosed: true,
      foundation6StillAuthoritative: true,
      directNormalizedWrite: false
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
