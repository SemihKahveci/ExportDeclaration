import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import { analyzePdfPath } from "../../src/modules/idp/analyzer/pdfAnalyzer.js";
import { buildInvoiceFieldCandidates } from "../../src/modules/idp/candidates/invoiceFieldCandidateEnricher.js";
import { discoverGenericInvoiceFieldCandidates } from "../../src/modules/idp/candidates/genericInvoiceCandidateDiscovery.js";
import { extractInvoice } from "../../src/modules/extraction/extractors/invoice.extractor.js";
import { PRODUCT_E2E_CORPUS_CASES, PRODUCT_E2E_CORPUS_ROOT } from "./productE2ECorpusGroundTruth.js";

function compactCandidate(candidate: any) {
  return {
    value: candidate?.value,
    source: candidate?.evidence?.[0]?.contentSource,
    text: candidate?.evidence?.[0]?.text,
    extractor: candidate?.extractor,
    candidateId: candidate?.candidateId
  };
}

async function main() {
  const corpusCase = PRODUCT_E2E_CORPUS_CASES.find((item) => item.id === "fiber-beton");
  assert(corpusCase, "Fiber Beton corpus case is required.");
  const pdfPath = path.join(PRODUCT_E2E_CORPUS_ROOT, corpusCase.pdf);
  await access(pdfPath);

  const canonical = await analyzePdfPath(pdfPath, { fileName: corpusCase.pdf, mimeType: "application/pdf" });
  const extracted = await extractInvoice(pdfPath, "application/pdf", { canonicalDocument: canonical });
  const production = buildInvoiceFieldCandidates(extracted.data, canonical, "segment-001");
  const generic = discoverGenericInvoiceFieldCandidates(canonical, "segment-001");

  const productionUnit = (production.fields?.["goodsLines.0.unit"] ?? []).map(compactCandidate);
  const genericUnit = (generic.fields?.["goodsLines.0.unit"] ?? []).map(compactCandidate);
  const rawItems = Array.isArray((extracted.data as any)?.extractMeta?.rawItems) ? (extracted.data as any).extractMeta.rawItems : [];
  const normalizedGoodsLines = Array.isArray((extracted.data as any)?.goodsLines) ? (extracted.data as any).goodsLines : [];

  const kgWords = canonical.pages.flatMap((page: any) => (page.words ?? [])
    .filter((word: any) => /^(?:kg|kgs|kilogram|kilograms)[.]?$/i.test(String(word?.text ?? "").trim()))
    .map((word: any) => ({ pageNumber: page.pageNumber, text: word.text, bbox: word.bbox })));
  const quantityWords = canonical.pages.flatMap((page: any) => (page.words ?? [])
    .filter((word: any) => /^(?:2[.,]?250|2250)$/.test(String(word?.text ?? "").replace(/\s/g, "")))
    .map((word: any) => ({ pageNumber: page.pageNumber, text: word.text, bbox: word.bbox })));

  const rawLineMentionsKg = rawItems.some((item: any) => /\bkg\b/i.test(String(item?.rawLine ?? "")));
  const sourceContainsKgToken = kgWords.length > 0;
  const legacyUnitMissing = productionUnit.length === 0;
  const genericUnitMissing = genericUnit.length === 0;

  console.log(JSON.stringify({
    event: "product-e2e-1.5.19.fiber-beton-unit-source-coverage.measured",
    id: "fiber-beton",
    classification: sourceContainsKgToken
      ? (genericUnitMissing ? "SOURCE_VISIBLE_GENERIC_ASSOCIATION_GAP" : "GENERIC_SOURCE_COVERS_LEGACY_GAP")
      : "SOURCE_NOT_VISIBLE",
    productionUnit,
    genericUnit,
    normalizedGoodsLine0: normalizedGoodsLines[0] ?? null,
    rawItem0: rawItems[0] ? {
      lineNo: rawItems[0].lineNo,
      quantity: rawItems[0].quantity,
      unit: rawItems[0].unit,
      unitPrice: rawItems[0].unitPrice,
      amount: rawItems[0].amount,
      rawLine: rawItems[0].rawLine
    } : null,
    sourceEvidence: { kgWords, quantityWords, rawLineMentionsKg },
    guardrails: {
      measurementOnly: true,
      legacyUnitMissing,
      noModelInferenceRequired: true,
      noDatabaseMutation: true,
      customerPdfsCommitted: false,
      directNormalizedWrite: false
    }
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
