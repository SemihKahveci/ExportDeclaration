import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import { analyzePdfPath } from "../../src/modules/idp/analyzer/pdfAnalyzer.js";
import { buildInvoiceFieldCandidates } from "../../src/modules/idp/candidates/invoiceFieldCandidateEnricher.js";
import { discoverGenericInvoiceFieldCandidates } from "../../src/modules/idp/candidates/genericInvoiceCandidateDiscovery.js";
import { extractInvoice } from "../../src/modules/extraction/extractors/invoice.extractor.js";
import { PRODUCT_E2E_CORPUS_CASES, PRODUCT_E2E_CORPUS_ROOT } from "./productE2ECorpusGroundTruth.js";

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const targetValue = "084104695730";

function summarizeEnvelope(label: string, envelope: any) {
  return Object.entries(envelope?.fields ?? {})
    .filter(([field]) => /^goodsLines\.\d+\.hsCode$/.test(field))
    .flatMap(([field, raw]) => (raw as any[]).map((candidate: any) => ({
      layer: label,
      field,
      value: String(candidate?.value ?? ""),
      candidateId: candidate?.candidateId,
      extractor: candidate?.extractor,
      confidence: candidate?.confidence,
      evidence: (candidate?.evidence ?? []).map((item: any) => ({
        pageNumber: item?.pageNumber,
        contentSource: item?.contentSource,
        text: item?.text,
        bbox: item?.bbox
      }))
    })));
}

async function main() {
  const corpusCase = PRODUCT_E2E_CORPUS_CASES.find((item) => item.id === "textilium");
  assert(corpusCase, "Textilium corpus case is required.");
  const pdfPath = path.join(PRODUCT_E2E_CORPUS_ROOT, corpusCase.pdf);
  await access(pdfPath);

  const canonical = await analyzePdfPath(pdfPath, { fileName: corpusCase.pdf, mimeType: "application/pdf" });
  const extracted = await extractInvoice(pdfPath, "application/pdf", { canonicalDocument: canonical });
  const productionCandidates = buildInvoiceFieldCandidates(extracted.data, canonical, "segment-001");
  const genericCandidates = discoverGenericInvoiceFieldCandidates(canonical, "segment-001");

  const rawItems = Array.isArray((extracted.data as any)?.extractMeta?.rawItems)
    ? (extracted.data as any).extractMeta.rawItems
    : [];
  const normalizedGoodsLines = Array.isArray((extracted.data as any)?.goodsLines)
    ? (extracted.data as any).goodsLines
    : [];

  const productionHs = summarizeEnvelope("PRODUCTION_LEGACY_ENRICHER", productionCandidates);
  const genericHs = summarizeEnvelope("GENERIC_DISCOVERY", genericCandidates);
  const offendingProduction = productionHs.filter((item) => digits(item.value) === targetValue);
  const offendingGeneric = genericHs.filter((item) => digits(item.value) === targetValue);

  const rawItemDiagnostics = rawItems.map((item: any, index: number) => ({
    index,
    lineNo: item?.lineNo,
    rawGtip: item?.gtip,
    normalizedHsCode: normalizedGoodsLines[index]?.hsCode,
    gtipBox: item?.boxes?.gtip,
    source: item?.source
  }));

  console.log(JSON.stringify({
    event: "product-e2e-1.5.13.gtip-candidate-provenance.measured",
    id: corpusCase.id,
    expectedFirstGoodsLineGtip: corpusCase.expected.firstGoodsLine.hsCode,
    offendingValue: targetValue,
    productionHsCandidates: productionHs,
    genericHsCandidates: genericHs,
    offendingValuePresentInProductionEnricher: offendingProduction.length > 0,
    offendingValuePresentInGenericDiscovery: offendingGeneric.length > 0,
    rawItemDiagnostics,
    classification: offendingProduction.length > 0 && offendingGeneric.length === 0
      ? "LEGACY_EXTRACTOR_OR_ENRICHER_PATH"
      : offendingGeneric.length > 0
        ? "GENERIC_DISCOVERY_PATH"
        : "NOT_REPRODUCED_BEFORE_VISION_FUSION",
    guardrails: {
      measurementOnly: true,
      noModelInferenceRequired: true,
      noDatabaseMutation: true,
      customerPdfsCommitted: false,
      directNormalizedWrite: false
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
