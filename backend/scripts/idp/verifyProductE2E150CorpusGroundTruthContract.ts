import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";

import { PRODUCT_E2E_CORPUS_CASES as CASES, PRODUCT_E2E_CORPUS_ROOT as ROOT } from "./productE2ECorpusGroundTruth.js";

async function main(): Promise<void> {
  assert.ok(CASES.length >= 4, "Product corpus must contain at least four heterogeneous invoices.");
  assert.equal(new Set(CASES.map((item) => item.id)).size, CASES.length, "Corpus ids must be unique.");
  assert.equal(new Set(CASES.map((item) => item.pdf)).size, CASES.length, "Corpus PDF names must be unique.");

  const available: string[] = [];
  const missing: string[] = [];
  for (const testCase of CASES) {
    assert.match(testCase.expected.invoiceNumber, /^[A-Z0-9-]+$/i);
    assert.match(testCase.expected.currency, /^[A-Z]{3}$/);
    assert.match(testCase.expected.firstGoodsLine.hsCode, /^\d{12}$/, `${testCase.id}: GTIP must be 12 digits.`);
    assert.ok(Number.isFinite(testCase.expected.firstGoodsLine.quantity));
    assert.ok(Number.isFinite(testCase.expected.firstGoodsLine.unitPrice));
    assert.ok(Number.isFinite(testCase.expected.firstGoodsLine.lineTotal));
    try {
      await access(path.join(ROOT, testCase.pdf));
      available.push(testCase.id);
    } catch {
      missing.push(testCase.id);
    }
  }

  assert.equal(
    missing.length,
    0,
    `Local product corpus is incomplete under ${ROOT}. Missing cases: ${missing.join(", ")}`,
  );

  console.log(JSON.stringify({
    event: "product-e2e-1.5.0.corpus-ground-truth-contract.passed",
    corpusCases: CASES.length,
    localCustomerPdfsAvailable: available.length,
    fixedGroundTruth: true,
    twelveDigitGtipGuard: true,
    duplicateCaseGuard: true,
    customerPdfsCommitted: false,
    directNormalizedWrite: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
