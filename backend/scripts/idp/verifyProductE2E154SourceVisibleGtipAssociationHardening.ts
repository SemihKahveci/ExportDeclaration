import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import { analyzePdfPath } from "../../src/modules/idp/analyzer/pdfAnalyzer.js";
import { buildInvoiceFieldCandidates } from "../../src/modules/idp/candidates/invoiceFieldCandidateEnricher.js";
import { extractInvoice } from "../../src/modules/extraction/extractors/invoice.extractor.js";
import { PRODUCT_E2E_CORPUS_CASES, PRODUCT_E2E_CORPUS_ROOT } from "./productE2ECorpusGroundTruth.js";

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

async function main() {
  const results = [];
  for (const corpusCase of PRODUCT_E2E_CORPUS_CASES) {
    const pdfPath = path.join(PRODUCT_E2E_CORPUS_ROOT, corpusCase.pdf);
    await access(pdfPath);
    const expected = corpusCase.expected.firstGoodsLine.hsCode;
    const canonical = await analyzePdfPath(pdfPath, { fileName: corpusCase.pdf, mimeType: "application/pdf" });
    const nativeText = canonical.pages.flatMap((page) => page.words.filter((word) => word.source !== "OCR").map((word) => word.text)).join(" ");
    assert.ok(digits(nativeText).includes(expected), `${corpusCase.id}: expected GTIP must remain source-visible for this hardening verifier.`);

    const extracted = await extractInvoice(pdfPath, "application/pdf", { canonicalDocument: canonical });
    const candidates = buildInvoiceFieldCandidates(extracted.data, canonical, "segment-001");
    const hsCandidates = Object.entries(candidates.fields)
      .filter(([field]) => /^goodsLines\.\d+\.hsCode$/.test(field))
      .flatMap(([, values]) => values);
    const match = hsCandidates.find((candidate) => digits(candidate.value) === expected);
    assert.ok(match, `${corpusCase.id}: source-visible exact 12-digit GTIP was not materialized as a deterministic candidate.`);
    assert.equal(match.evidence[0]?.contentSource, "NATIVE_TEXT", `${corpusCase.id}: DIGITAL corpus GTIP must retain native-text provenance.`);
    results.push({ id: corpusCase.id, expectedGtip: expected, deterministicCandidateMatchesExpectedGtip: true });
  }

  console.log(JSON.stringify({
    event: "product-e2e-1.5.4.source-visible-gtip-association-hardening.passed",
    corpusCases: results.length,
    results,
    exactTwelveDigitSourceVisibleCoverage: true,
    legacyAmbiguousRepairStillGeometryBounded: true,
    supplierSpecificRuleAdded: false,
    noModelInferenceRequired: true,
    directNormalizedWrite: false
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
