import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  PRODUCT_E2E_GENERALIZATION_CASES as CASES,
  PRODUCT_E2E_GENERALIZATION_CORPUS_ROOT as ROOT,
} from "./productE2EGeneralizationGroundTruth.js";

async function main(): Promise<void> {
  assert.ok(CASES.length >= 5, "Frozen holdout corpus must contain a meaningful first cohort.");
  assert.ok(CASES.some((item) => item.mode === "SCANNED"), "Frozen cohort must include a SCANNED source.");
  assert.ok(CASES.some((item) => item.expected.goodsLines.length > 1), "Frozen cohort must include multi-line goods assertions.");
  assert.ok(CASES.some((item) => item.expectedReviewFields.length > 0), "Frozen cohort must include an intentional fail-closed/review case.");

  const missing: string[] = [];
  const verified: string[] = [];
  for (const testCase of CASES) {
    const source = path.join(ROOT, testCase.pdf);
    let bytes: Buffer;
    try {
      bytes = await readFile(source);
    } catch {
      missing.push(testCase.pdf);
      continue;
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    assert.equal(sha256, testCase.sourceSha256, `${testCase.id}: staged PDF bytes do not match the pre-execution frozen SHA-256.`);
    verified.push(testCase.id);
  }

  assert.equal(missing.length, 0, `Stage the selected holdout PDFs under ${ROOT} before this verifier. Missing: ${missing.join(", ")}`);

  console.log(JSON.stringify({
    event: "product-e2e-1.6.2.frozen-holdout-corpus.passed",
    corpusCases: CASES.length,
    exactSourceHashesVerified: verified.length,
    modes: [...new Set(CASES.map((item) => item.mode))].sort(),
    multiLineCases: CASES.filter((item) => item.expected.goodsLines.length > 1).length,
    intentionalReviewCases: CASES.filter((item) => item.expectedReviewFields.length > 0).length,
    scannedCases: CASES.filter((item) => item.mode === "SCANNED").length,
    idpExecuted: false,
    visionOrLlmRequired: false,
    existingKnownCorpusReusedAsUnseen: false,
    sourceExpectationsDerivedFromPipelineOutput: false,
    supplierSpecificRules: false,
    directNormalizedWrite: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
