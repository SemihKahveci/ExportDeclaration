import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import { analyzePdfPath } from "../../src/modules/idp/analyzer/pdfAnalyzer.js";
import { buildInvoiceFieldCandidates } from "../../src/modules/idp/candidates/invoiceFieldCandidateEnricher.js";
import { discoverGenericInvoiceFieldCandidates } from "../../src/modules/idp/candidates/genericInvoiceCandidateDiscovery.js";
import { extractInvoice } from "../../src/modules/extraction/extractors/invoice.extractor.js";
import { PRODUCT_E2E_CORPUS_CASES, PRODUCT_E2E_CORPUS_ROOT } from "./productE2ECorpusGroundTruth.js";

const TARGET_FIELDS = new Set([
  "goodsLines.0.description",
  "goodsLines.0.productCode",
  "goodsLines.0.hsCode",
  "goodsLines.0.quantity",
  "goodsLines.0.unit",
  "goodsLines.0.unitPrice",
  "goodsLines.0.lineTotal"
]);

function targetCandidates(envelope: any) {
  return Object.fromEntries(
    Object.entries(envelope?.fields ?? {})
      .filter(([field]) => TARGET_FIELDS.has(field))
      .map(([field, candidates]) => [field, (candidates as any[]).map(candidate => ({
        value: candidate?.value,
        confidence: candidate?.confidence,
        extractor: candidate?.extractor,
        candidateId: candidate?.candidateId,
        evidence: candidate?.evidence
      }))])
  );
}

function centerY(word: any): number {
  return ((Number(word?.bbox?.y0) || 0) + (Number(word?.bbox?.y1) || 0)) / 2;
}

function normalized(text: unknown): string {
  return String(text ?? "").toLocaleUpperCase("tr-TR").replace(/İ/g, "I");
}

async function main() {
  const corpus = PRODUCT_E2E_CORPUS_CASES.find(item => item.id === "makro-boya");
  assert(corpus, "Makro Boya corpus case is required.");
  const pdfPath = path.join(PRODUCT_E2E_CORPUS_ROOT, corpus.pdf);
  await access(pdfPath);

  // Deliberately stop at native/canonical extraction. No Vision provider, LLM,
  // declaration persistence, resolution or promotion is invoked by this diagnostic.
  const canonical = await analyzePdfPath(pdfPath, { fileName: corpus.pdf, mimeType: "application/pdf" });
  const extracted = await extractInvoice(pdfPath, "application/pdf", { canonicalDocument: canonical });
  const production = buildInvoiceFieldCandidates(extracted.data, canonical, "segment-001");
  const generic = discoverGenericInvoiceFieldCandidates(canonical, "segment-001");

  const tokenHits = canonical.pages.flatMap((page: any) => page.words
    .filter((word: any) => /TYLOSE|100000/i.test(String(word?.text ?? "")))
    .map((word: any) => {
      const y = centerY(word);
      const context = page.words
        .filter((other: any) => Math.abs(centerY(other) - y) <= 0.035)
        .sort((a: any, b: any) => centerY(a) - centerY(b) || a.bbox.x0 - b.bbox.x0)
        .map((other: any) => ({ text: other.text, bbox: other.bbox, source: other.source }));
      return { pageNumber: page.pageNumber, text: word.text, bbox: word.bbox, source: word.source, localContext: context };
    }));

  const rawItems = Array.isArray((extracted.data as any)?.extractMeta?.rawItems)
    ? (extracted.data as any).extractMeta.rawItems
    : [];
  const normalizedGoodsLines = Array.isArray((extracted.data as any)?.goodsLines)
    ? (extracted.data as any).goodsLines
    : [];

  const rawTargetHits = rawItems
    .map((item: any, index: number) => ({ index, item }))
    .filter(({ item }: any) => /TYLOSE|100000/.test(normalized(JSON.stringify(item))))
    .map(({ index, item }: any) => ({
      index,
      lineNo: item?.lineNo,
      gtip: item?.gtip,
      productCode: item?.productCode,
      description: item?.description,
      quantity: item?.quantity,
      unit: item?.unit,
      unitPrice: item?.unitPrice,
      amount: item?.amount,
      rawLine: item?.rawLine
    }));

  console.log(JSON.stringify({
    event: "product-e2e-1.5.26.makro-description-native-coverage.measured",
    id: corpus.id,
    expectedDescriptionContains: "TYLOSE 100000",
    canonicalTokenHits: tokenHits,
    rawItemTargetHits: rawTargetHits,
    firstRawItems: rawItems.slice(0, 4).map((item: any, index: number) => ({
      index,
      lineNo: item?.lineNo,
      gtip: item?.gtip,
      productCode: item?.productCode,
      description: item?.description,
      quantity: item?.quantity,
      unit: item?.unit,
      unitPrice: item?.unitPrice,
      amount: item?.amount,
      rawLine: item?.rawLine
    })),
    firstNormalizedGoodsLines: normalizedGoodsLines.slice(0, 4),
    productionTargetCandidates: targetCandidates(production),
    genericTargetCandidates: targetCandidates(generic),
    diagnosisHints: {
      canonicalContainsTarget: tokenHits.length > 0,
      legacyRawExtractionContainsTarget: rawTargetHits.length > 0,
      productionDescriptionContainsTarget: (production?.fields?.["goodsLines.0.description"] ?? []).some((candidate: any) => /TYLOSE\s*100000/i.test(String(candidate?.value ?? ""))),
      genericDescriptionContainsTarget: (generic?.fields?.["goodsLines.0.description"] ?? []).some((candidate: any) => /TYLOSE\s*100000/i.test(String(candidate?.value ?? "")))
    },
    guardrails: {
      measurementOnly: true,
      noModelInferenceRequired: true,
      noDatabaseMutation: true,
      noProductionBehaviorChange: true,
      supplierSpecificProductionRules: false,
      customerPdfsCommitted: false,
      directNormalizedWrite: false
    }
  }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
