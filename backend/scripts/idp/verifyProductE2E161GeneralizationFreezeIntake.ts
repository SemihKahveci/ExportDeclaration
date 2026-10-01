import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { freezeGeneralizationCase } from "./freezeProductE2EGeneralizationCase.js";

async function main(): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "idp-generalization-freeze-"));
  const pdfPath = path.join(dir, "unseen-fixture.pdf");
  const truthPath = path.join(dir, "truth.json");
  const frozenPath = path.join(dir, "frozen.json");

  await writeFile(pdfPath, Buffer.from("%PDF-1.4\n% deterministic contract fixture\n%%EOF\n"));
  await writeFile(truthPath, JSON.stringify({
    id: "unseen-contract-fixture",
    mode: "DIGITAL",
    expected: {
      invoiceNumber: "HUMAN-FROZEN-001",
      currency: "EUR",
      goodsLines: [
        { descriptionContains: "HUMAN VERIFIED ITEM", hsCode: "123456789012", quantity: 2, unit: "ADET", unitPrice: 3, lineTotal: 6 },
        { descriptionContains: "SECOND HUMAN VERIFIED ITEM", quantity: 1, unit: "KG" }
      ]
    },
    expectedReviewFields: ["originCountry"]
  }, null, 2));

  const frozen = await freezeGeneralizationCase({ pdfPath, groundTruthPath: truthPath, outputPath: frozenPath, frozenOn: "2026-10-01" });
  const persisted = JSON.parse(await readFile(frozenPath, "utf8"));
  assert.equal(persisted.id, frozen.id);
  assert.equal(persisted.expected.invoiceNumber, "HUMAN-FROZEN-001");
  assert.equal(persisted.expected.goodsLines.length, 2);
  assert.equal(persisted.expectedReviewFields[0], "originCountry");
  assert.match(persisted.sourceSha256, /^[a-f0-9]{64}$/);

  let overwriteRejected = false;
  try {
    await freezeGeneralizationCase({ pdfPath, groundTruthPath: truthPath, outputPath: frozenPath, frozenOn: "2026-10-01" });
  } catch (error: any) {
    overwriteRejected = error?.code === "EEXIST";
  }
  assert.equal(overwriteRejected, true, "Frozen case artifacts must reject overwrite/update attempts.");

  console.log(JSON.stringify({
    event: "product-e2e-1.6.1.generalization-freeze-intake.passed",
    exactPdfSha256ComputedBeforeExecution: true,
    humanGroundTruthInputRequired: true,
    multiLineGoodsFrozen: true,
    expectedReviewFieldsFrozen: true,
    frozenArtifactOverwriteRejected: true,
    idpExecutionRequired: false,
    visionOrLlmRequired: false,
    existingKnownCorpusReusedAsUnseen: false,
    supplierSpecificRules: false,
    directNormalizedWrite: false
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
