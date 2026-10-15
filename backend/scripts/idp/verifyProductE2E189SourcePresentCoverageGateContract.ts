import assert from "node:assert/strict";
import {
  aggregateSourcePresentCoverage,
  sourcePresentFamily,
  summarizeSourcePresentCoverage,
} from "./productE2ESourcePresentCoverage.js";

assert.equal(sourcePresentFamily("invoiceNumber"), "IDENTITY");
assert.equal(sourcePresentFamily("deliveryTerm"), "TRADE");
assert.equal(sourcePresentFamily("originCountry"), "COUNTRY");
assert.equal(sourcePresentFamily("grossWeight"), "PACKAGE");
assert.equal(sourcePresentFamily("goodsLines[0].hsCode"), "GOODS");
assert.equal(sourcePresentFamily("goodsLines.length"), "GOODS");

const caseA = summarizeSourcePresentCoverage([
  { field:"invoiceNumber", passed:true },
  { field:"deliveryTerm", passed:false },
  { field:"goodsLines.length", passed:true },
  { field:"goodsLines[0].hsCode", passed:true },
]);
const trade = caseA.find((entry) => entry.family === "TRADE");
assert.deepEqual(trade, { family:"TRADE", passed:0, total:1, percent:0, failedFields:["deliveryTerm"] });
const goods = caseA.find((entry) => entry.family === "GOODS");
assert.deepEqual(goods, { family:"GOODS", passed:2, total:2, percent:100, failedFields:[] });

const aggregate = aggregateSourcePresentCoverage([
  { sourcePresentCoverage:caseA },
  { sourcePresentCoverage:summarizeSourcePresentCoverage([
    { field:"invoiceNumber", passed:true },
    { field:"deliveryTerm", passed:true },
  ]) },
]);
const identity = aggregate.find((entry) => entry.family === "IDENTITY");
assert.equal(identity?.passed, 2);
assert.equal(identity?.total, 2);
assert.equal(identity?.percent, 100);
const aggregateTrade = aggregate.find((entry) => entry.family === "TRADE");
assert.equal(aggregateTrade?.passed, 1);
assert.equal(aggregateTrade?.total, 2);
assert.equal(aggregateTrade?.percent, 50);

console.log(JSON.stringify({
  event:"product-e2e-1.8.9.source-present-coverage-gate.contract.passed",
  guardrails:{
    frozenSourcePresentAssertionsOnly:true,
    absentSourceFieldsExcluded:true,
    familyCoverageMeasured:true,
    exactGoodsCardinalityClassifiedAsGoods:true,
    vendorAgnostic:true,
    measurementOnly:true,
    directNormalizedWrite:false,
  },
}, null, 2));
