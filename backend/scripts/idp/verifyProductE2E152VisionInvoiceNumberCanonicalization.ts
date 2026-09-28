import assert from "node:assert/strict";
import { canonicalizeVisionInvoiceNumber } from "../../src/modules/idp/llm/qwenVisionInvoiceProvider.js";

function main() {
  const cases: Array<[unknown, unknown]> = [
    ["TXT202600000091", "TXT2026000000091"],
    ["IHR202600000035", "IHR2026000000035"],
    ["AAA202600000009", "AAA2026000000009"],
    ["CLK2026000001021", "CLK2026000001021"],
    ["INV-2026-0091", "INV-2026-0091"],
    ["ABC199900000091", "ABC199900000091"],
    ["AB202600000091", "AB202600000091"],
    [12345, 12345]
  ];
  for (const [input, expected] of cases) assert.deepEqual(canonicalizeVisionInvoiceNumber(input), expected);
  console.log(JSON.stringify({
    event: "product-e2e-1.5.2.vision-invoice-number-canonicalization.passed",
    systematicCorpusPatternCovered: true,
    narrowTurkishStyleShapeOnly: true,
    alreadyCanonicalPreserved: true,
    arbitraryInvoiceIdsPreserved: true,
    noModelInferenceRequired: true,
    directNormalizedWrite: false
  }, null, 2));
}
main();
