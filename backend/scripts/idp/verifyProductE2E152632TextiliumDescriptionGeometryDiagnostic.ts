import assert from "node:assert/strict";
import path from "node:path";
import { analyzePdfPath } from "../../src/modules/idp/analyzer/pdfAnalyzer.js";
import { runPythonInvoiceParser } from "../../src/modules/extraction/python/invoiceParser.runner.js";
import { PRODUCT_E2E_CORPUS_CASES, PRODUCT_E2E_CORPUS_ROOT } from "./productE2ECorpusGroundTruth.js";

const norm = (v: unknown) => String(v ?? "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/İ/g, "I")
  .toUpperCase();

const round = (v: number) => Number(v.toFixed(3));

async function main(): Promise<void> {
  const corpus = PRODUCT_E2E_CORPUS_CASES.find((entry) => entry.id === "textilium");
  assert.ok(corpus, "textilium corpus case missing");

  const pdfPath = path.join(PRODUCT_E2E_CORPUS_ROOT, corpus.pdf);
  const canonical = await analyzePdfPath(pdfPath, { fileName: corpus.pdf, mimeType: "application/pdf" });
  assert.equal(canonical.analysis.contentKind, "DIGITAL", "textilium: diagnostic requires DIGITAL input");

  const parsed = await runPythonInvoiceParser(pdfPath, { canonicalDocument: canonical });
  const item = parsed.items?.[0];
  assert.ok(item, "textilium: first parsed item missing");

  const needles = ["ERKEK", "LIKRA", "LİKRA"];
  const hits = canonical.pages.flatMap((page) => page.words
    .filter((word) => needles.some((needle) => norm(word.text).includes(norm(needle))))
    .map((word) => ({ pageNumber: page.pageNumber, text: word.text, x0: word.bbox.x0, y0: word.bbox.y0 })));

  const rows = new Map<string, { pageNumber: number; y0: number; words: Array<{ text: string; x0: number }> }>();
  for (const hit of hits) {
    const page = canonical.pages.find((p) => p.pageNumber === hit.pageNumber);
    if (!page) continue;
    for (const word of page.words) {
      if (Math.abs(word.bbox.y0 - hit.y0) > 0.012) continue;
      const bucketY = round(word.bbox.y0);
      const key = `${page.pageNumber}:${bucketY}`;
      const row = rows.get(key) ?? { pageNumber: page.pageNumber, y0: bucketY, words: [] };
      if (!row.words.some((entry) => entry.text === word.text && entry.x0 === round(word.bbox.x0))) {
        row.words.push({ text: word.text, x0: round(word.bbox.x0) });
      }
      rows.set(key, row);
    }
  }

  const compactRows = [...rows.values()]
    .sort((a, b) => a.pageNumber - b.pageNumber || a.y0 - b.y0)
    .slice(0, 12)
    .map((row) => ({
      pageNumber: row.pageNumber,
      y0: row.y0,
      text: row.words.sort((a, b) => a.x0 - b.x0).map((word) => word.text).join(" | "),
    }));

  console.log(JSON.stringify({
    event: "product-e2e-1.5.26.3.2.textilium-description-geometry-diagnostic.measured",
    measurementOnly: true,
    modelInferenceRequired: false,
    visionProviderUsed: false,
    databaseMutation: false,
    parsedFirstItem: {
      description: item.description,
      productCode: item.productCode,
      hsCode: item.gtip,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      amount: item.amount,
      rawLine: item.rawLine,
    },
    expectedDescriptionContains: corpus.expected.firstGoodsLine.descriptionContains,
    keywordHits: hits.slice(0, 12).map((hit) => ({
      pageNumber: hit.pageNumber,
      text: hit.text,
      x0: round(hit.x0),
      y0: round(hit.y0),
    })),
    nearbyRows: compactRows,
    supplierSpecificRules: false,
    directNormalizedWrite: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
