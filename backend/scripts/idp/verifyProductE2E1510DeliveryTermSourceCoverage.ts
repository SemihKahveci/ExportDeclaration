import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import { analyzePdfPath } from "../../src/modules/idp/analyzer/pdfAnalyzer.js";
import { discoverInvoiceCommercialTermsFieldCandidates } from "../../src/modules/idp/candidates/invoiceCommercialTermsCandidateDiscovery.js";
import { PRODUCT_E2E_CORPUS_CASES, PRODUCT_E2E_CORPUS_ROOT } from "./productE2ECorpusGroundTruth.js";

const norm = (value: unknown) => String(value ?? "").trim().toUpperCase();

async function main() {
  const only = process.env.PRODUCT_E2E_CASE?.trim();
  const cases = only ? PRODUCT_E2E_CORPUS_CASES.filter((item) => item.id === only) : PRODUCT_E2E_CORPUS_CASES;
  assert.ok(cases.length, `Unknown PRODUCT_E2E_CASE: ${only}`);

  const results = [];
  for (const corpusCase of cases) {
    const expected = corpusCase.expected.deliveryTerm;
    if (!expected) continue;

    const pdfPath = path.join(PRODUCT_E2E_CORPUS_ROOT, corpusCase.pdf);
    await access(pdfPath);
    const canonical = await analyzePdfPath(pdfPath, { fileName: corpusCase.pdf, mimeType: "application/pdf" });
    const discovered = discoverInvoiceCommercialTermsFieldCandidates(canonical, "segment-001");
    const candidates = discovered.fields["trade.deliveryTerm"] ?? [];
    const values = candidates.map((candidate) => ({
      value: String(candidate.value),
      confidence: candidate.confidence,
      extractor: candidate.extractor,
      sources: [...new Set(candidate.evidence.map((item) => item.contentSource))],
      evidenceText: candidate.evidence.map((item) => item.text)
    }));
    const deterministicCandidateMatchesExpected = candidates.some((candidate) => norm(candidate.value) === norm(expected));

    results.push({
      id: corpusCase.id,
      contentKind: canonical.analysis.contentKind,
      expectedDeliveryTerm: expected,
      deterministicCandidateCount: candidates.length,
      deterministicCandidateMatchesExpected,
      candidates: values,
      classification: deterministicCandidateMatchesExpected
        ? "DETERMINISTIC_SOURCE_COVERS_VISION_GAP"
        : candidates.length > 0
          ? "DETERMINISTIC_SOURCE_CONFLICT"
          : "DETERMINISTIC_SOURCE_GAP"
    });
  }

  console.log(JSON.stringify({
    event: "product-e2e-1.5.10.delivery-term-source-coverage.measured",
    cases: results.length,
    results,
    summary: {
      deterministicCoverage: results.filter((result) => result.deterministicCandidateMatchesExpected).length,
      deterministicSourceConflict: results.filter((result) => result.classification === "DETERMINISTIC_SOURCE_CONFLICT").length,
      deterministicSourceGap: results.filter((result) => result.classification === "DETERMINISTIC_SOURCE_GAP").length
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
