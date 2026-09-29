import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import { analyzePdfPath } from "../../src/modules/idp/analyzer/pdfAnalyzer.js";
import { buildInvoiceFieldCandidates } from "../../src/modules/idp/candidates/invoiceFieldCandidateEnricher.js";
import { discoverGenericInvoiceFieldCandidates } from "../../src/modules/idp/candidates/genericInvoiceCandidateDiscovery.js";
import { extractInvoice } from "../../src/modules/extraction/extractors/invoice.extractor.js";
import { PRODUCT_E2E_CORPUS_CASES, PRODUCT_E2E_CORPUS_ROOT } from "./productE2ECorpusGroundTruth.js";

const GOODS = /^goodsLines\.(\d+)\.(hsCode|productCode|description|quantity|unit|unitPrice|lineTotal)$/;

function rows(envelope: any) {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [field, candidates] of Object.entries(envelope?.fields ?? {})) {
    const match = GOODS.exec(field);
    if (!match) continue;
    const row = (out[match[1]] ??= {});
    row[match[2]] = (candidates as any[])?.map((c) => ({
      value: c?.value,
      source: c?.evidence?.[0]?.contentSource,
      text: c?.evidence?.[0]?.text,
      extractor: c?.extractor
    }));
  }
  return out;
}

async function main() {
  const corpusCase = PRODUCT_E2E_CORPUS_CASES.find((item) => item.id === "textilium");
  assert(corpusCase, "Textilium corpus case is required.");
  const pdfPath = path.join(PRODUCT_E2E_CORPUS_ROOT, corpusCase.pdf);
  await access(pdfPath);

  const canonical = await analyzePdfPath(pdfPath, { fileName: corpusCase.pdf, mimeType: "application/pdf" });
  const extracted = await extractInvoice(pdfPath, "application/pdf", { canonicalDocument: canonical });
  const production = buildInvoiceFieldCandidates(extracted.data, canonical, "segment-001");
  const generic = discoverGenericInvoiceFieldCandidates(canonical, "segment-001");
  const rawItems = Array.isArray((extracted.data as any)?.extractMeta?.rawItems) ? (extracted.data as any).extractMeta.rawItems : [];
  const normalizedGoodsLines = Array.isArray((extracted.data as any)?.goodsLines) ? (extracted.data as any).goodsLines : [];

  const productionRows = rows(production);
  const genericRows = rows(generic);
  assert.equal(String((productionRows as any)?.[0]?.hsCode?.[0]?.value ?? ""), "610510000000");
  assert.equal(String((genericRows as any)?.[0]?.hsCode?.[0]?.value ?? ""), "610510000000");

  console.log(JSON.stringify({
    event: "product-e2e-1.5.15.goods-row-alignment.measured",
    id: "textilium",
    productionRows,
    genericRows,
    normalizedGoodsLines,
    rawItems: rawItems.map((item: any, index: number) => ({
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
