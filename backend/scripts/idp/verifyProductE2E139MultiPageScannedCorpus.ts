import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import { env } from "../../src/config/env.js";
import { InvoiceLlmEvidenceMode } from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";
import { QwenVisionInvoiceProvider } from "../../src/modules/idp/llm/qwenVisionInvoiceProvider.js";
import { renderInvoicePagesForVision } from "../../src/modules/idp/llm/renderInvoicePagesForVision.js";

const ROOT = "/app/uploads/product-e2e";
const REQUESTED = [
  "invoiceNumber", "currency", "deliveryTerm",
  "goodsLines[].productCode", "goodsLines[].description", "goodsLines[].hsCode",
  "goodsLines[].quantity", "goodsLines[].unit", "goodsLines[].unitPrice",
  "goodsLines[].lineTotal", "goodsLines[].origin"
];

function fieldValue(fields: Array<{ field: string; value: unknown }>, name: string): unknown {
  return fields.find((field) => field.field === name)?.value;
}
function asArray(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function first(value: unknown): unknown { return asArray(value)[0]; }
function last(value: unknown): unknown {
  const values = asArray(value);
  return values.length > 0 ? values[values.length - 1] : undefined;
}
function normalizedText(value: unknown): string {
  return String(value ?? "").trim().toLocaleUpperCase("tr-TR").replace(/\s+/g, " ");
}
function digits(value: unknown): string { return normalizedText(value).replace(/\D/g, ""); }
function localeNumber(value: unknown): number {
  // Vision should preserve what it sees, including currency/unit suffixes.
  // The verifier owns deterministic numeric normalization for comparison.
  const raw = normalizedText(value)
    .replace(/[^0-9,\.\-+]/g, "");
  if (!raw || !/[0-9]/.test(raw)) return Number.NaN;

  if (raw.includes(",") && raw.includes(".")) {
    const comma = raw.lastIndexOf(",");
    const dot = raw.lastIndexOf(".");
    return comma > dot
      ? Number(raw.replace(/\./g, "").replace(",", "."))
      : Number(raw.replace(/,/g, ""));
  }

  if (raw.includes(",")) {
    // In this invoice corpus comma is the decimal separator when it is the
    // only separator; preserve trailing precision such as 106,800 -> 106.8.
    return Number(raw.replace(",", "."));
  }

  return Number(raw);
}
function eqText(actual: unknown, expected: string): boolean {
  return normalizedText(actual) === normalizedText(expected);
}
function eqNumber(actual: unknown, expected: number): boolean {
  const parsed = localeNumber(actual);
  return Number.isFinite(parsed) && Math.abs(parsed - expected) < 1e-6;
}
function check(name: string, expected: string, actual: unknown, passed: boolean) {
  return { name, expected, actual: String(actual ?? ""), passed };
}

async function extractPages(pdf: string, pages: number[], documentId: string) {
  const pdfPath = path.join(ROOT, pdf);
  await access(pdfPath);
  console.log(JSON.stringify({
    event: "product-e2e-1.3.9.case.started",
    pdf, pages, imageOnly: true
  }));
  const pageImages = await renderInvoicePagesForVision(pdfPath, pages);
  const provider = new QwenVisionInvoiceProvider();
  return await provider.extractInvoice({
    version: "invoice-extraction-v1",
    documentId,
    evidenceMode: InvoiceLlmEvidenceMode.PAGE_IMAGE,
    requestedFields: REQUESTED,
    nativeText: "",
    ocrText: "",
    verifiedKnowledge: []
  }, pageImages);
}

async function extractInPageChunks(pdf: string, pageChunks: number[][], documentId: string) {
  const responses = [];
  for (let index = 0; index < pageChunks.length; index += 1) {
    const pages = pageChunks[index]!;
    console.log(JSON.stringify({
      event: "product-e2e-1.3.9.page-chunk.started",
      pdf,
      chunk: index + 1,
      totalChunks: pageChunks.length,
      pages
    }));
    const response = await extractPages(pdf, pages, `${documentId}-chunk-${index + 1}`);
    responses.push({ pages, response });
    console.log(JSON.stringify({
      event: "product-e2e-1.3.9.page-chunk.completed",
      pdf,
      chunk: index + 1,
      totalChunks: pageChunks.length,
      pages,
      decision: response.decision
    }));
  }
  return responses;
}

function mergeChunkFields(chunks: Awaited<ReturnType<typeof extractInPageChunks>>) {
  const documentFields = ["invoiceNumber", "currency", "deliveryTerm"];
  return REQUESTED.map((field) => {
    const values = chunks
      .map(({ response }) => fieldValue(response.fields, field))
      .filter((value) => value !== undefined && value !== null);
    if (field.startsWith("goodsLines[].")) {
      return { field, value: values.flatMap((value) => asArray(value)) };
    }
    return { field, value: values.find((value) => normalizedText(value) !== "") ?? null };
  }).filter(({ field, value }) =>
    documentFields.includes(field) ? value !== null : asArray(value).length > 0
  );
}

async function runVed146() {
  const chunks = await extractInPageChunks(
    "VED2026000000146(2).pdf",
    [[1,2],[3,4],[5,6],[7,8]],
    "product-e2e-1.3.9-ved146"
  );
  const fields = mergeChunkFields(chunks);
  const response = chunks[0]!.response;
  const productCodes = fieldValue(fields, "goodsLines[].productCode");
  const descriptions = fieldValue(fields, "goodsLines[].description");
  const hsCodes = fieldValue(fields, "goodsLines[].hsCode");
  const quantities = fieldValue(fields, "goodsLines[].quantity");
  const units = fieldValue(fields, "goodsLines[].unit");
  const prices = fieldValue(fields, "goodsLines[].unitPrice");
  const totals = fieldValue(fields, "goodsLines[].lineTotal");
  const origins = fieldValue(fields, "goodsLines[].origin");

  const checks = [
    check("invoiceNumber", "VED2026000000146", fieldValue(fields,"invoiceNumber"), eqText(fieldValue(fields,"invoiceNumber"),"VED2026000000146")),
    check("currency", "EUR", fieldValue(fields,"currency"), eqText(fieldValue(fields,"currency"),"EUR")),
    check("deliveryTerm", "FCA", fieldValue(fields,"deliveryTerm"), eqText(fieldValue(fields,"deliveryTerm"),"FCA")),
    check("first.productCode", "AG.SCH.C25B4", first(productCodes), eqText(first(productCodes),"AG.SCH.C25B4")),
    check("first.description", "contains C25B4 BASIC FRAME", first(descriptions), normalizedText(first(descriptions)).includes("C25B4 BASIC FRAME")),
    check("first.hsCode", "853620900019", first(hsCodes), digits(first(hsCodes))==="853620900019"),
    check("first.quantity", "15", first(quantities), eqNumber(first(quantities),15)),
    check("first.unit", "ADET", first(units), eqText(first(units),"ADET")),
    check("first.unitPrice", "106.8", first(prices), eqNumber(first(prices),106.8)),
    check("first.lineTotal", "1602", first(totals), eqNumber(first(totals),1602)),
    check("first.origin", "POLAND", first(origins), eqText(first(origins),"POLAND")),
    check("last.productCode", "AG.SCH.C10H3", last(productCodes), eqText(last(productCodes),"AG.SCH.C10H3")),
    check("last.hsCode", "853620900019", last(hsCodes), digits(last(hsCodes))==="853620900019"),
    check("last.quantity", "5", last(quantities), eqNumber(last(quantities),5)),
    check("last.unit", "ADET", last(units), eqText(last(units),"ADET")),
    check("last.unitPrice", "73.71", last(prices), eqNumber(last(prices),73.71)),
    check("last.lineTotal", "368.55", last(totals), eqNumber(last(totals),368.55)),
    check("last.origin", "POLAND", last(origins), eqText(last(origins),"POLAND"))
  ];
  const passed = checks.filter((item)=>item.passed).length;
  const lengths = Object.fromEntries([
    ["productCode",productCodes],["description",descriptions],["hsCode",hsCodes],
    ["quantity",quantities],["unit",units],["unitPrice",prices],["lineTotal",totals],["origin",origins]
  ].map(([name,value])=>[name,asArray(value).length]));
  const result = {
    id:"ved146-digital-multipage",
    model:response.model,
    decision:response.decision,
    pages:[1,2,3,4,5,6,7,8],
    pageChunks:[[1,2],[3,4],[5,6],[7,8]],
    expectedGoodsLines:56,
    returnedArrayLengths:lengths,
    accuracy:{passed,total:checks.length,percent:Number((passed/checks.length*100).toFixed(1))},
    checks
  };
  console.log(JSON.stringify({event:"product-e2e-1.3.9.digital-multipage.completed",...result},null,2));
  return result;
}

async function runVed110ScannedSmoke() {
  const pdf = "VED2026000000110(2).pdf";
  const chunks = await extractInPageChunks(
    pdf,
    [[1],[2],[3]],
    "product-e2e-1.3.9-ved110-scanned"
  );
  const fields = mergeChunkFields(chunks);
  const response = chunks[0]!.response;
  const observed = Object.fromEntries(REQUESTED.map((name)=>[name,fieldValue(fields,name) ?? null]));
  const result = {
    id:"ved110-scanned-multipage",
    model:response.model,
    decision:response.decision,
    pages:[1,2,3],
    pageChunks:[[1],[2],[3]],
    mode:"OBSERVATIONAL_NO_SILENT_GROUND_TRUTH",
    observed
  };
  console.log(JSON.stringify({event:"product-e2e-1.3.9.scanned-multipage.completed",...result},null,2));
  return result;
}

async function main(): Promise<void> {
  assert.equal(env.llmEnabled,true,"LLM_ENABLED=true olmalı.");
  assert.equal(env.llmVisionEnabled,true,"LLM_VISION_ENABLED=true olmalı.");

  const digital = await runVed146();
  const scanned = await runVed110ScannedSmoke();

  console.log(JSON.stringify({
    event:"product-e2e-1.3.9.multipage-scanned-corpus.completed",
    model:env.llmVisionModel,
    digital,
    scanned,
    guardrails:{
      realCustomerPdfsCommitted:false,
      imageOnly:true,
      multiPage:true,
      ved146GroundTruthFixedFromSourcePdf:true,
      ved110GroundTruthNotInvented:true,
      directNormalizedWrite:false
    }
  },null,2));
}

main().catch((error)=>{ console.error(error); process.exitCode=1; });
