import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import { analyzePdfPath } from "../../src/modules/idp/analyzer/pdfAnalyzer.js";
import { buildInvoiceFieldCandidates } from "../../src/modules/idp/candidates/invoiceFieldCandidateEnricher.js";
import { discoverGenericInvoiceFieldCandidates } from "../../src/modules/idp/candidates/genericInvoiceCandidateDiscovery.js";
import { extractInvoice } from "../../src/modules/extraction/extractors/invoice.extractor.js";
import { PRODUCT_E2E_CORPUS_CASES, PRODUCT_E2E_CORPUS_ROOT } from "./productE2ECorpusGroundTruth.js";

function hsValues(envelope: any) {
  return Object.entries(envelope?.fields ?? {})
    .filter(([field]) => /^goodsLines\.\d+\.hsCode$/.test(field))
    .sort(([a], [b]) => Number(a.split(".")[1]) - Number(b.split(".")[1]))
    .map(([field, raw]) => ({ field, value: String((raw as any[])?.[0]?.value ?? "") }));
}

async function main() {
  const corpusCase = PRODUCT_E2E_CORPUS_CASES.find((item) => item.id === "textilium");
  assert(corpusCase, "Textilium corpus case is required.");
  const pdfPath = path.join(PRODUCT_E2E_CORPUS_ROOT, corpusCase.pdf);
  await access(pdfPath);

  const canonical = await analyzePdfPath(pdfPath, { fileName: corpusCase.pdf, mimeType: "application/pdf" });
  const extracted = await extractInvoice(pdfPath, "application/pdf", { canonicalDocument: canonical });
  const production = hsValues(buildInvoiceFieldCandidates(extracted.data, canonical, "segment-001"));
  const generic = hsValues(discoverGenericInvoiceFieldCandidates(canonical, "segment-001"));

  const expected = ["610510000000", "610990200012"];
  const productionValues = production.map((item) => item.value);
  const genericValues = generic.map((item) => item.value);
  const rawItems = Array.isArray((extracted.data as any)?.extractMeta?.rawItems) ? (extracted.data as any).extractMeta.rawItems : [];

  const businessIdentifierSubstringRejected = !productionValues.includes("084104695730");
  const invoiceNumberSubstringRejected = !productionValues.includes("202600000009");
  const goodsLineOrdinalsCompacted = expected.every((value, index) => production[index]?.value === value);
  const genericDiscoveryUnchanged = expected.every((value, index) => generic[index]?.value === value);
  const rawItemsAligned = expected.every((value, index) => String(rawItems[index]?.gtip ?? "") === value) && rawItems.length === expected.length;

  assert(businessIdentifierSubstringRejected);
  assert(invoiceNumberSubstringRejected);
  assert(goodsLineOrdinalsCompacted);
  assert(genericDiscoveryUnchanged);
  assert(rawItemsAligned);

  console.log(JSON.stringify({
    event: "product-e2e-1.5.14.legacy-gtip-goods-row-hardening.passed",
    businessIdentifierSubstringRejected,
    invoiceNumberSubstringRejected,
    goodsLineOrdinalsCompacted,
    rawItemsAligned,
    genericDiscoveryUnchanged,
    productionHsCandidates: production,
    genericHsCandidates: generic,
    guardrails: {
      supplierSpecificRuleAdded: false,
      noModelInferenceRequired: true,
      noDatabaseMutation: true,
      customerPdfsCommitted: false,
      directNormalizedWrite: false
    }
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
