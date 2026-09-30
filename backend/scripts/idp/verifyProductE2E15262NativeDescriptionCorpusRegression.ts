import assert from "node:assert/strict";
import path from "node:path";
import { analyzePdfPath } from "../../src/modules/idp/analyzer/pdfAnalyzer.js";
import { runPythonInvoiceParser } from "../../src/modules/extraction/python/invoiceParser.runner.js";
import { PRODUCT_E2E_CORPUS_CASES, PRODUCT_E2E_CORPUS_ROOT } from "./productE2ECorpusGroundTruth.js";

const TARGETS = new Set(["textilium", "fiber-beton", "makro-boya"]);
const fold = (value: unknown) => String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/İ/g, "I").toUpperCase().replace(/\s+/g, " ").trim();

async function main(): Promise<void> {
  const cases = PRODUCT_E2E_CORPUS_CASES.filter((entry) => TARGETS.has(entry.id));
  assert.equal(cases.length, 3, "Expected Textilium, Makro and Fiber Beton corpus cases.");

  const results = [];
  for (const corpus of cases) {
    const pdfPath = path.join(PRODUCT_E2E_CORPUS_ROOT, corpus.pdf);
    const canonical = await analyzePdfPath(pdfPath, { fileName: corpus.pdf, mimeType: "application/pdf" });
    assert.equal(canonical.analysis.contentKind, "DIGITAL", `${corpus.id}: native-only regression requires DIGITAL corpus input.`);
    const parsed = await runPythonInvoiceParser(pdfPath, { canonicalDocument: canonical });
    const description = parsed.items?.[0]?.description;
    const expected = corpus.expected.firstGoodsLine.descriptionContains;
    const passed = fold(description).includes(fold(expected));
    results.push({ id: corpus.id, expected: `contains ${expected}`, actual: description, passed });
    assert.equal(passed, true, `${corpus.id}: first goods description regression: ${JSON.stringify(description)}`);
  }

  console.log(JSON.stringify({
    event: "product-e2e-1.5.26.2.native-description-corpus-regression.passed",
    modelInferenceRequired: false,
    databaseMutation: false,
    visionProviderUsed: false,
    supplierSpecificRules: false,
    cases: results
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
