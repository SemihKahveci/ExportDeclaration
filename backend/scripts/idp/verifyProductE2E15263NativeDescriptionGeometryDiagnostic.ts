import assert from "node:assert/strict";
import path from "node:path";
import { analyzePdfPath } from "../../src/modules/idp/analyzer/pdfAnalyzer.js";
import { runPythonInvoiceParser } from "../../src/modules/extraction/python/invoiceParser.runner.js";
import { PRODUCT_E2E_CORPUS_CASES, PRODUCT_E2E_CORPUS_ROOT } from "./productE2ECorpusGroundTruth.js";

const TARGETS = new Set(["textilium", "fiber-beton", "makro-boya"]);
const norm = (v: unknown) => String(v ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/İ/g, "I").toUpperCase();

async function main(): Promise<void> {
  const cases = PRODUCT_E2E_CORPUS_CASES.filter((entry) => TARGETS.has(entry.id));
  assert.equal(cases.length, 3);
  const results = [];
  for (const corpus of cases) {
    const pdfPath = path.join(PRODUCT_E2E_CORPUS_ROOT, corpus.pdf);
    const canonical = await analyzePdfPath(pdfPath, { fileName: corpus.pdf, mimeType: "application/pdf" });
    assert.equal(canonical.analysis.contentKind, "DIGITAL", `${corpus.id}: diagnostic requires DIGITAL input`);
    const parsed = await runPythonInvoiceParser(pdfPath, { canonicalDocument: canonical });
    const hs = corpus.expected.firstGoodsLine.hsCode;
    const page = canonical.pages.find((p) => p.words.some((w) => norm(w.text).includes(norm(hs)))) ?? canonical.pages[0]!;
    const hsWord = page.words.find((w) => norm(w.text).includes(norm(hs)));
    const anchorY = hsWord ? hsWord.bbox.y0 : undefined;
    const nearby = page.words
      .filter((w) => anchorY === undefined || Math.abs(w.bbox.y0 - anchorY) <= 120)
      .sort((a,b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0)
      .map((w) => ({ text:w.text, x0:Number(w.bbox.x0.toFixed(2)), y0:Number(w.bbox.y0.toFixed(2)), x1:Number(w.bbox.x1.toFixed(2)), y1:Number(w.bbox.y1.toFixed(2)), dy:anchorY === undefined ? null : Number((w.bbox.y0-anchorY).toFixed(2)) }));
    results.push({ id: corpus.id, hsCode: hs, anchorY, parsedFirstDescription: parsed.items?.[0]?.description, expectedDescriptionContains: corpus.expected.firstGoodsLine.descriptionContains, nearbyNativeWords: nearby });
  }
  console.log(JSON.stringify({
    event:"product-e2e-1.5.26.3.native-description-geometry-diagnostic.measured",
    measurementOnly:true, modelInferenceRequired:false, visionProviderUsed:false, databaseMutation:false,
    supplierSpecificRules:false, directNormalizedWrite:false, results
  }, null, 2));
}
main().catch((error)=>{ console.error(error); process.exitCode=1; });
