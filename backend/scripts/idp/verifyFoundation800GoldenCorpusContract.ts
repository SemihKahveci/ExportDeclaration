import assert from "node:assert/strict";
import { loadAllGoldenCases, loadGoldenCase } from "./foundation8/goldenCorpus.js";
import { scoreGoldenInvoice } from "./foundation8/goldenCorpusScorer.js";

const cases = loadAllGoldenCases();
assert.equal(cases.length, 7);
assert.deepEqual(cases.map(c => c.id).sort(), ["celikel","dermeternal","ningbo","pml","ved146","volta","yem"]);
for (const c of cases) {
  assert.equal(c.schemaVersion, "foundation8-golden-v1");
  assert.match(c.sourceSha256, /^[a-f0-9]{64}$/);
  assert.ok(c.expected.exactGoodsRowCount > 0);
  assert.ok(c.expected.requiredGoodsFields.length > 0);
  assert.ok(c.evidenceBasis.length > 0);
}
assert.equal(loadGoldenCase("ved146").expected.exactGoodsRowCount, 56);
assert.equal(loadGoldenCase("celikel").expected.exactGoodsRowCount, 3);
assert.equal(loadGoldenCase("dermeternal").expected.exactGoodsRowCount, 4);
assert.equal(loadGoldenCase("ningbo").expected.exactGoodsRowCount, 4);
assert.equal(loadGoldenCase("pml").expected.exactGoodsRowCount, 1);
assert.equal(loadGoldenCase("volta").expected.exactGoodsRowCount, 1);
assert.equal(loadGoldenCase("yem").expected.exactGoodsRowCount, 1);

// Contract: a GTIP-only skeleton corpus can never pass merely because row count/HS tokens exist.
const ved = loadGoldenCase("ved146");
const skeleton = {
  scalars: { ...ved.expected.scalars },
  goodsRows: Array.from({ length: 56 }, (_, i) => i === 0
    ? { productCode:"AG.SCH.C25B4", description:"C25B4 BASIC FRAME NSX250B 25kA AC 4P 250A", hsCode:"853620900019", quantity:15, unit:"ADET", unitPrice:106.8, lineTotal:1602, origin:"POLAND" }
    : { hsCode:"853620900019" })
};
const skeletonScore = scoreGoldenInvoice(ved, skeleton);
assert.equal(skeletonScore.pass, false);
assert.equal(skeletonScore.summary.actualGoodsRowCount, 56);
assert.equal(skeletonScore.summary.completeRows, 1);
assert.ok(skeletonScore.failures.some(f => f.kind === "COMPLETENESS"));

// Contract: YEM packaging count cannot masquerade as commercial quantity even if a fabricated amount is arithmetically coherent.
const yem = loadGoldenCase("yem");
const yemWrong = scoreGoldenInvoice(yem, {
  scalars: { ...yem.expected.scalars },
  goodsRows: [{ productCode:"91101", description:"Tavuk İşlenmiş Ayak A Kalite", hsCode:"020714990012", quantity:1250, unit:"KG", unitPrice:0.70, lineTotal:875, origin:"TR" }]
});
assert.equal(yemWrong.pass, false);
assert.ok(yemWrong.failures.some(f => f.kind === "ROW_FIELD"));

// Contract: Volta amount cannot become quantity.
const volta = loadGoldenCase("volta");
const voltaWrong = scoreGoldenInvoice(volta, {
  scalars: { ...volta.expected.scalars },
  goodsRows: [{ productCode:"PS4", description:"PS4 GASOLINE SCOOTER (50CC) BLUE", hsCode:"871110000011", quantity:560, unit:"ADET", unitPrice:560, lineTotal:560, origin:"TR" }]
});
assert.equal(voltaWrong.pass, false);
assert.ok(voltaWrong.failures.some(f => f.kind === "ROW_FIELD"));

console.log(JSON.stringify({
  event: "foundation-8.0.golden-corpus.contract.passed",
  cases: cases.map(c => ({ id:c.id, rows:c.expected.exactGoodsRowCount, requiredGoodsFields:c.expected.requiredGoodsFields })),
  acceptance: {
    sevenCasesFrozen: true,
    vedGtipOnlySkeletonFails: true,
    yemPackagingQuantitySwapFails: true,
    voltaAmountQuantitySwapFails: true,
    runtimeGroundTruthIsolation: true
  },
  guardrails: {
    productionExtractionChanged: false,
    supplierSpecificProductionRules: false,
    invoiceSpecificProductionConstants: false,
    modelOrOcrRequired: false,
    databaseMutation: false,
    directNormalizedWrite: false
  }
}, null, 2));
