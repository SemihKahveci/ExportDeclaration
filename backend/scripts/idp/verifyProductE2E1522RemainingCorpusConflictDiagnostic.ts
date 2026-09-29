import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import { analyzePdfPath } from "../../src/modules/idp/analyzer/pdfAnalyzer.js";
import { buildInvoiceFieldCandidates } from "../../src/modules/idp/candidates/invoiceFieldCandidateEnricher.js";
import { discoverGenericInvoiceFieldCandidates } from "../../src/modules/idp/candidates/genericInvoiceCandidateDiscovery.js";
import { extractInvoice } from "../../src/modules/extraction/extractors/invoice.extractor.js";
import { PRODUCT_E2E_CORPUS_CASES, PRODUCT_E2E_CORPUS_ROOT } from "./productE2ECorpusGroundTruth.js";

const TARGETS: Record<string, string[]> = {
  "clk-celikel": ["invoiceNo", "goodsLines.0.quantity"],
  "makro-boya": ["goodsLines.0.description", "goodsLines.0.quantity", "goodsLines.0.unitPrice"]
};

function compact(candidate: any) {
  return {
    value: candidate?.value,
    confidence: candidate?.confidence,
    source: candidate?.evidence?.[0]?.contentSource,
    text: candidate?.evidence?.[0]?.text,
    pageNumber: candidate?.evidence?.[0]?.pageNumber,
    extractor: candidate?.extractor,
    candidateId: candidate?.candidateId
  };
}

function select(envelope: any, fields: string[]) {
  return Object.fromEntries(fields.map((field) => [field, (envelope?.fields?.[field] ?? []).map(compact)]));
}

function sourceLines(canonical: any, needles: Array<string | number>) {
  const normalizedNeedles = needles.map(String).map((v) => v.toUpperCase().replace(/\s+/g, ""));
  return canonical.pages.flatMap((page: any) => {
    const lines = Array.isArray(page?.lines) ? page.lines : [];
    return lines
      .filter((line: any) => {
        const text = String(line?.text ?? "").toUpperCase().replace(/\s+/g, "");
        return normalizedNeedles.some((needle) => needle && text.includes(needle));
      })
      .map((line: any) => ({ pageNumber: page.pageNumber, text: line.text, bbox: line.bbox }));
  }).slice(0, 30);
}

async function inspect(id: "clk-celikel" | "makro-boya") {
  const corpus = PRODUCT_E2E_CORPUS_CASES.find((item) => item.id === id);
  assert(corpus, `${id} corpus case is required.`);
  const pdfPath = path.join(PRODUCT_E2E_CORPUS_ROOT, corpus.pdf);
  await access(pdfPath);

  const canonical = await analyzePdfPath(pdfPath, { fileName: corpus.pdf, mimeType: "application/pdf" });
  const extracted = await extractInvoice(pdfPath, "application/pdf", { canonicalDocument: canonical });
  const production = buildInvoiceFieldCandidates(extracted.data, canonical, "segment-001");
  const generic = discoverGenericInvoiceFieldCandidates(canonical, "segment-001");
  const fields = TARGETS[id];
  const rawItems = Array.isArray((extracted.data as any)?.extractMeta?.rawItems) ? (extracted.data as any).extractMeta.rawItems : [];
  const goods = Array.isArray((extracted.data as any)?.goodsLines) ? (extracted.data as any).goodsLines : [];
  const expected = corpus.expected;
  const needles = id === "clk-celikel"
    ? [expected.invoiceNumber, expected.firstGoodsLine.quantity]
    : [expected.firstGoodsLine.descriptionContains, expected.firstGoodsLine.quantity, expected.firstGoodsLine.unitPrice, expected.firstGoodsLine.lineTotal];

  return {
    id,
    expected: id === "clk-celikel"
      ? { invoiceNo: expected.invoiceNumber, quantity: expected.firstGoodsLine.quantity }
      : { descriptionContains: expected.firstGoodsLine.descriptionContains, quantity: expected.firstGoodsLine.quantity, unitPrice: expected.firstGoodsLine.unitPrice },
    productionCandidates: select(production, fields),
    genericCandidates: select(generic, fields),
    normalizedGoodsLine0: goods[0] ?? null,
    rawItem0: rawItems[0] ?? null,
    sourceLines: sourceLines(canonical, needles)
  };
}

async function main() {
  const cases = [await inspect("clk-celikel"), await inspect("makro-boya")];
  console.log(JSON.stringify({
    event: "product-e2e-1.5.22.remaining-corpus-conflict-diagnostic.measured",
    cases,
    guardrails: {
      measurementOnly: true,
      noModelInferenceRequired: true,
      noDatabaseMutation: true,
      customerPdfsCommitted: false,
      directNormalizedWrite: false
    }
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
