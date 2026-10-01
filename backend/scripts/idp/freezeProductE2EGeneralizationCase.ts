import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ProductE2EGeneralizationCase } from "./productE2EGeneralizationGroundTruth.js";

type FreezeInput = Omit<ProductE2EGeneralizationCase, "pdf" | "sourceSha256" | "groundTruthFrozenOn"> & {
  groundTruthFrozenOn?: string;
};

const SHA256 = /^[a-f0-9]{64}$/;
const MODES = new Set(["DIGITAL", "SCANNED", "MIXED"]);
const GTIP = /^\d{12}$/;
const CURRENCY = /^[A-Z]{3}$/;

export async function freezeGeneralizationCase(args: {
  pdfPath: string;
  groundTruthPath: string;
  outputPath: string;
  frozenOn?: string;
}): Promise<ProductE2EGeneralizationCase> {
  const pdfBytes = await readFile(args.pdfPath);
  assert.ok(pdfBytes.length > 0, "Holdout PDF must not be empty.");
  assert.equal(path.extname(args.pdfPath).toLowerCase(), ".pdf", "Holdout source must be a PDF.");

  const input = JSON.parse(await readFile(args.groundTruthPath, "utf8")) as FreezeInput;
  assert.match(input.id, /^[a-z0-9][a-z0-9-]*$/, "id must be stable kebab-case.");
  assert.ok(MODES.has(input.mode), `Unsupported document mode ${input.mode}.`);
  assert.ok(Array.isArray(input.expected.goodsLines), "expected.goodsLines must be an array.");
  assert.ok(Array.isArray(input.expectedReviewFields), "expectedReviewFields must be an array.");
  assert.equal(new Set(input.expectedReviewFields).size, input.expectedReviewFields.length, "expectedReviewFields must not contain duplicates.");
  if (input.expected.currency !== undefined) assert.match(input.expected.currency, CURRENCY, "currency must be ISO-like uppercase 3-letter code.");
  input.expected.goodsLines.forEach((line, index) => {
    assert.ok(line.descriptionContains?.trim(), `goodsLines[${index}].descriptionContains is required.`);
    if (line.hsCode !== undefined) assert.match(line.hsCode, GTIP, `goodsLines[${index}].hsCode must be 12 digits.`);
  });

  const sourceSha256 = createHash("sha256").update(pdfBytes).digest("hex");
  assert.match(sourceSha256, SHA256);
  const groundTruthFrozenOn = args.frozenOn ?? input.groundTruthFrozenOn ?? new Date().toISOString().slice(0, 10);
  assert.match(groundTruthFrozenOn, /^\d{4}-\d{2}-\d{2}$/, "groundTruthFrozenOn must be YYYY-MM-DD.");

  const frozen: ProductE2EGeneralizationCase = {
    id: input.id,
    pdf: path.basename(args.pdfPath),
    mode: input.mode,
    sourceSha256,
    groundTruthFrozenOn,
    expected: input.expected,
    expectedReviewFields: input.expectedReviewFields,
  };

  // Exclusive create is deliberate: a frozen ground-truth artifact is immutable.
  await writeFile(args.outputPath, `${JSON.stringify(frozen, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return frozen;
}

async function main(): Promise<void> {
  const [pdfPath, groundTruthPath, outputPath, frozenOn] = process.argv.slice(2);
  assert.ok(pdfPath && groundTruthPath && outputPath, "Usage: freezeProductE2EGeneralizationCase.ts <pdf> <ground-truth.json> <frozen-case.json> [YYYY-MM-DD]");
  const frozen = await freezeGeneralizationCase({ pdfPath, groundTruthPath, outputPath, frozenOn });
  console.log(JSON.stringify({
    event: "product-e2e-1.6.1.generalization-case-frozen",
    id: frozen.id,
    pdf: frozen.pdf,
    mode: frozen.mode,
    sourceSha256: frozen.sourceSha256,
    groundTruthFrozenOn: frozen.groundTruthFrozenOn,
    idpExecuted: false,
  }, null, 2));
}

if (process.argv[1]?.includes("freezeProductE2EGeneralizationCase")) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
