import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import { analyzePdfPath } from "../../src/modules/idp/analyzer/pdfAnalyzer.js";
import { buildInvoiceFieldCandidates } from "../../src/modules/idp/candidates/invoiceFieldCandidateEnricher.js";
import { extractInvoice } from "../../src/modules/extraction/extractors/invoice.extractor.js";
import { PRODUCT_E2E_CORPUS_CASES, PRODUCT_E2E_CORPUS_ROOT } from "./productE2ECorpusGroundTruth.js";

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

async function main() {
  const only = process.env.PRODUCT_E2E_CASE?.trim();
  const cases = only ? PRODUCT_E2E_CORPUS_CASES.filter((item) => item.id === only) : PRODUCT_E2E_CORPUS_CASES;
  assert.ok(cases.length, `Unknown PRODUCT_E2E_CASE: ${only}`);

  const results = [];
  for (const corpusCase of cases) {
    const pdfPath = path.join(PRODUCT_E2E_CORPUS_ROOT, corpusCase.pdf);
    await access(pdfPath);
    const expected = corpusCase.expected.firstGoodsLine.hsCode;
    const canonical = await analyzePdfPath(pdfPath, { fileName: corpusCase.pdf, mimeType: "application/pdf" });
    const nativeText = canonical.pages
      .flatMap((page) => page.words.filter((word) => word.source !== "OCR").map((word) => word.text))
      .join(" ");
    const nativeTextContainsExpectedGtip = digits(nativeText).includes(expected);

    const extracted = await extractInvoice(pdfPath, "application/pdf", { canonicalDocument: canonical });
    const candidates = buildInvoiceFieldCandidates(extracted.data, canonical, "segment-001");
    const hsCandidates = Object.entries(candidates.fields)
      .filter(([field]) => /^goodsLines\.\d+\.hsCode$/.test(field))
      .flatMap(([, values]) => values);
    const deterministicCandidateMatchesExpectedGtip = hsCandidates.some((candidate) => digits(candidate.value) === expected);
    const deterministicCandidateCount = hsCandidates.length;

    const classification = deterministicCandidateMatchesExpectedGtip
      ? "DETERMINISTIC_SOURCE_COVERS_VISION_GAP"
      : nativeTextContainsExpectedGtip
        ? "SOURCE_VISIBLE_PARSER_GAP"
        : "SOURCE_NOT_VISIBLE_TO_NATIVE_TEXT";

    results.push({
      id: corpusCase.id,
      contentKind: canonical.analysis.contentKind,
      expectedGtip: expected,
      nativeTextContainsExpectedGtip,
      deterministicCandidateCount,
      deterministicCandidateMatchesExpectedGtip,
      classification
    });
  }

  assert.ok(results.every((result) => /^\d{12}$/.test(result.expectedGtip)), "Corpus GTIP ground truth must remain 12 digits.");
  console.log(JSON.stringify({
    event: "product-e2e-1.5.3.gtip-source-coverage-matrix.measured",
    cases: results.length,
    results,
    summary: {
      deterministicCoverage: results.filter((result) => result.deterministicCandidateMatchesExpectedGtip).length,
      sourceVisibleParserGap: results.filter((result) => result.classification === "SOURCE_VISIBLE_PARSER_GAP").length,
      sourceNotVisibleToNativeText: results.filter((result) => result.classification === "SOURCE_NOT_VISIBLE_TO_NATIVE_TEXT").length
    },
    guardrails: {
      fixedGroundTruth: true,
      measurementOnly: true,
      noModelInferenceRequired: true,
      customerPdfsCommitted: false,
      directNormalizedWrite: false
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
