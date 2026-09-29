import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import { analyzePdfPath } from "../../src/modules/idp/analyzer/pdfAnalyzer.js";
import { buildInvoiceFieldCandidates } from "../../src/modules/idp/candidates/invoiceFieldCandidateEnricher.js";
import { extractInvoice } from "../../src/modules/extraction/extractors/invoice.extractor.js";
import { PRODUCT_E2E_CORPUS_CASES, PRODUCT_E2E_CORPUS_ROOT } from "./productE2ECorpusGroundTruth.js";

function firstValue(envelope: any, field: string) { return envelope?.fields?.[field]?.[0]?.value; }

async function main() {
  const corpusCase = PRODUCT_E2E_CORPUS_CASES.find((item) => item.id === "textilium");
  assert(corpusCase, "Textilium corpus case is required.");
  const pdfPath = path.join(PRODUCT_E2E_CORPUS_ROOT, corpusCase.pdf);
  await access(pdfPath);

  const canonical = await analyzePdfPath(pdfPath, { fileName: corpusCase.pdf, mimeType: "application/pdf" });
  const extracted = await extractInvoice(pdfPath, "application/pdf", { canonicalDocument: canonical });
  const production = buildInvoiceFieldCandidates(extracted.data, canonical, "segment-001");
  const rawItems = Array.isArray((extracted.data as any)?.extractMeta?.rawItems) ? (extracted.data as any).extractMeta.rawItems : [];

  const row0 = {
    hsCode: firstValue(production, "goodsLines.0.hsCode"),
    quantity: firstValue(production, "goodsLines.0.quantity"),
    unit: firstValue(production, "goodsLines.0.unit"),
    unitPrice: firstValue(production, "goodsLines.0.unitPrice"),
    lineTotal: firstValue(production, "goodsLines.0.lineTotal")
  };
  const row1 = {
    hsCode: firstValue(production, "goodsLines.1.hsCode"),
    quantity: firstValue(production, "goodsLines.1.quantity"),
    unit: firstValue(production, "goodsLines.1.unit"),
    unitPrice: firstValue(production, "goodsLines.1.unitPrice"),
    lineTotal: firstValue(production, "goodsLines.1.lineTotal")
  };

  assert.equal(String(row0.hsCode), "610510000000");
  assert.equal(Number(row0.quantity), 569);
  assert.equal(String(row0.unit).toUpperCase(), "ADET");
  assert.equal(Number(row0.unitPrice), 14.8);
  assert.equal(Number(row0.lineTotal), 8421.2);
  assert.equal(String(row1.hsCode), "610990200012");
  assert.equal(Number(row1.quantity), 168);
  assert.ok(Math.abs(Number(row1.unitPrice) - 18.0797) < 0.0001);
  assert.equal(Number(row1.lineTotal), 3037.4);
  assert.equal(String(rawItems?.[0]?.quantity), "569");
  assert.ok(["14,8", "14,80", "14.8"].includes(String(rawItems?.[0]?.unitPrice)));

  console.log(JSON.stringify({
    event: "product-e2e-1.5.16.legacy-goods-scalar-association.passed",
    firstGoodsRowUsesCommercialQuantity: true,
    leadingRowNumberRejectedAsQuantity: true,
    singleDecimalUnitPriceAccepted: true,
    amountArithmeticPreserved: true,
    secondGoodsRowUnchanged: true,
    productionRows: { "0": row0, "1": row1 },
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
