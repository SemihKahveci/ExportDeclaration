import assert from "node:assert/strict";

import { PRODUCT_E2E_GENERALIZATION_CASES as CASES } from "./productE2EGeneralizationGroundTruth.js";

const MODES = new Set(["DIGITAL", "SCANNED", "MIXED"]);
const SHA256 = /^[a-f0-9]{64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;
const GTIP = /^\d{12}$/;

function finiteOptional(value: number | undefined, label: string): void {
  if (value !== undefined) assert.ok(Number.isFinite(value), `${label} must be finite when present.`);
}

async function main(): Promise<void> {
  assert.equal(new Set(CASES.map((item) => item.id)).size, CASES.length, "Generalization corpus ids must be unique.");
  assert.equal(new Set(CASES.map((item) => item.pdf)).size, CASES.length, "Generalization corpus PDF names must be unique.");
  assert.equal(new Set(CASES.map((item) => item.sourceSha256)).size, CASES.length, "Generalization source hashes must be unique.");

  for (const testCase of CASES) {
    assert.match(testCase.id, /^[a-z0-9][a-z0-9-]*$/, `${testCase.id}: id must be stable kebab-case.`);
    assert.ok(testCase.pdf.toLowerCase().endsWith(".pdf"), `${testCase.id}: source must be a PDF.`);
    assert.ok(MODES.has(testCase.mode), `${testCase.id}: unsupported document mode ${testCase.mode}.`);
    assert.match(testCase.sourceSha256, SHA256, `${testCase.id}: sourceSha256 must freeze the exact source bytes.`);
    assert.match(testCase.groundTruthFrozenOn, ISO_DATE, `${testCase.id}: groundTruthFrozenOn must be YYYY-MM-DD.`);

    if (testCase.expected.currency !== undefined) assert.match(testCase.expected.currency, CURRENCY, `${testCase.id}: currency must be ISO-like 3-letter uppercase.`);
    finiteOptional(testCase.expected.grossWeight, `${testCase.id}.grossWeight`);
    finiteOptional(testCase.expected.netWeight, `${testCase.id}.netWeight`);

    assert.ok(Array.isArray(testCase.expected.goodsLines), `${testCase.id}: goodsLines must be an array.`);
    testCase.expected.goodsLines.forEach((line, index) => {
      assert.ok(line.descriptionContains.trim().length > 0, `${testCase.id}.goodsLines[${index}]: descriptionContains is required.`);
      if (line.hsCode !== undefined) assert.match(line.hsCode, GTIP, `${testCase.id}.goodsLines[${index}]: GTIP must be 12 digits when present.`);
      finiteOptional(line.quantity, `${testCase.id}.goodsLines[${index}].quantity`);
      finiteOptional(line.unitPrice, `${testCase.id}.goodsLines[${index}].unitPrice`);
      finiteOptional(line.lineTotal, `${testCase.id}.goodsLines[${index}].lineTotal`);
    });

    assert.equal(
      new Set(testCase.expectedReviewFields).size,
      testCase.expectedReviewFields.length,
      `${testCase.id}: expectedReviewFields must not contain duplicates.`,
    );
  }

  console.log(JSON.stringify({
    event: "product-e2e-1.6.0.generalization-corpus-contract.passed",
    corpusCases: CASES.length,
    bootstrapManifestEmpty: CASES.length === 0,
    groundTruthFrozenBeforeExecutionRequired: true,
    exactSourceHashRequired: true,
    documentModesSupported: ["DIGITAL", "SCANNED", "MIXED"],
    multiLineGoodsGroundTruthSupported: true,
    expectedReviewFieldsSupported: true,
    customerPdfsRequiredForContractCheck: false,
    idpExecutionRequiredForContractCheck: false,
    visionOrLlmRequiredForContractCheck: false,
    supplierSpecificRules: false,
    directNormalizedWrite: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
