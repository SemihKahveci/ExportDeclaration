import assert from "node:assert/strict";
import path from "node:path";
import { analyzePdfPath } from "../../src/modules/idp/analyzer/pdfAnalyzer.js";
import { runPythonInvoiceParser } from "../../src/modules/extraction/python/invoiceParser.runner.js";
import { PRODUCT_E2E_CORPUS_CASES, PRODUCT_E2E_CORPUS_ROOT } from "./productE2ECorpusGroundTruth.js";

const TARGETS = new Set(["textilium", "fiber-beton", "makro-boya"]);
const norm = (v: unknown) => String(v ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/İ/g, "I").toUpperCase();
const tokens = (v: unknown) => norm(v).split(/[^A-Z0-9]+/).filter((x) => x.length >= 3);

async function main(): Promise<void> {
  const cases = PRODUCT_E2E_CORPUS_CASES.filter((entry) => TARGETS.has(entry.id));
  assert.equal(cases.length, 3);
  const results = [];

  for (const corpus of cases) {
    const pdfPath = path.join(PRODUCT_E2E_CORPUS_ROOT, corpus.pdf);
    const canonical = await analyzePdfPath(pdfPath, { fileName: corpus.pdf, mimeType: "application/pdf" });
    assert.equal(canonical.analysis.contentKind, "DIGITAL", `${corpus.id}: diagnostic requires DIGITAL input`);
    const parsed = await runPythonInvoiceParser(pdfPath, { canonicalDocument: canonical });
    const item = parsed.items?.[0];
    const expected = corpus.expected.firstGoodsLine.descriptionContains;
    const interesting = new Set([...tokens(expected), ...tokens(item?.description), ...tokens(item?.productCode)]);

    const matched = canonical.pages.flatMap((page) => page.words
      .filter((w) => [...interesting].some((t) => norm(w.text).includes(t) || t.includes(norm(w.text))))
      .map((w) => ({ pageNumber: page.pageNumber, text: w.text, x0: w.bbox.x0, y0: w.bbox.y0 })));

    const anchors = matched.map((m) => ({ pageNumber: m.pageNumber, y0: m.y0 }));
    const context = canonical.pages.flatMap((page) => page.words
      .filter((w) => anchors.some((a) => a.pageNumber === page.pageNumber && Math.abs(w.bbox.y0 - a.y0) <= 0.018))
      .sort((a,b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0)
      .map((w) => ({ pageNumber: page.pageNumber, text: w.text, x0: Number(w.bbox.x0.toFixed(3)), y0: Number(w.bbox.y0.toFixed(3)) })));

    results.push({
      id: corpus.id,
      parsedFirstItem: {
        description: item?.description,
        productCode: item?.productCode,
        hsCode: item?.gtip,
        quantity: item?.quantity,
        unit: item?.unit,
        unitPrice: item?.unitPrice,
        amount: item?.amount,
        rawLine: item?.rawLine,
      },
      expectedDescriptionContains: expected,
      matchedDescriptionWords: matched.map((m) => ({...m, x0:Number(m.x0.toFixed(3)), y0:Number(m.y0.toFixed(3))})),
      compactLineContext: context,
    });
  }

  console.log(JSON.stringify({
    event:"product-e2e-1.5.26.3.1.compact-native-description-geometry-diagnostic.measured",
    measurementOnly:true, modelInferenceRequired:false, visionProviderUsed:false, databaseMutation:false,
    supplierSpecificRules:false, directNormalizedWrite:false, results
  }, null, 2));
}
main().catch((error)=>{ console.error(error); process.exitCode=1; });
