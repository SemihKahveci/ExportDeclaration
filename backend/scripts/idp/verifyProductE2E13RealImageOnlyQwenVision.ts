import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import { env } from "../../src/config/env.js";
import { InvoiceLlmEvidenceMode } from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";
import { QwenVisionInvoiceProvider } from "../../src/modules/idp/llm/qwenVisionInvoiceProvider.js";
import { renderInvoicePagesForVision } from "../../src/modules/idp/llm/renderInvoicePagesForVision.js";

const DEFAULT_PDF = "/app/uploads/product-e2e/AAA2026000000009.pdf";

function fieldValue(fields: Array<{ field: string; value: unknown }>, name: string): unknown {
  return fields.find((field) => field.field === name)?.value;
}

function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function normalizedText(value: unknown): string {
  return String(value ?? "").trim().toLocaleUpperCase("tr-TR").replace(/\s+/g, " ");
}

function searchFold(value: unknown): string {
  return normalizedText(value)
    .replace(/İ/g, "I")
    .replace(/Ş/g, "S")
    .replace(/Ğ/g, "G")
    .replace(/Ü/g, "U")
    .replace(/Ö/g, "O")
    .replace(/Ç/g, "C");
}

function digits(value: unknown): string {
  return normalizedText(first(value)).replace(/\D/g, "");
}

function localeNumberValue(value: unknown): number {
  // Product E2E 1.3.4 deliberately evaluates this Turkish invoice with a
  // deterministic locale policy. The LLM is expected to return the raw visible
  // token; separator interpretation belongs here, not in the model.
  const raw = normalizedText(first(value)).replace(/[^0-9,.-]/g, "");
  if (!raw) return Number.NaN;

  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  let normalized = raw;
  if (comma >= 0) {
    // Turkish-style decimal comma; dots before it are thousands separators.
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (dot >= 0) {
    // On this Turkish invoice, a lone dot followed by exactly three digits is
    // a thousands separator (2.250 -> 2250). Other dot forms stay decimal.
    const fractionLength = raw.length - dot - 1;
    normalized = fractionLength === 3 ? raw.replace(/\./g, "") : raw;
  }
  return Number(normalized);
}


async function main(): Promise<void> {
  assert.equal(env.llmEnabled, true, "LLM_ENABLED=true olmalı.");
  assert.equal(env.llmVisionEnabled, true, "LLM_VISION_ENABLED=true olmalı.");
  assert.ok(env.llmBaseUrl, "LLM_BASE_URL gerekli.");
  assert.ok(env.llmVisionModel.trim(), "LLM_VISION_MODEL gerekli.");

  const pdfPath = path.resolve(process.argv[2] ?? DEFAULT_PDF);
  await access(pdfPath);

  // Intentionally render only page 1 and supply NO native/OCR text. This is the
  // product gate proving that the vision model can directly parse page pixels.
  const pageImages = await renderInvoicePagesForVision(pdfPath, [1]);
  const provider = new QwenVisionInvoiceProvider();
  const requestedFields = [
    "invoiceNumber", "currency", "deliveryTerm", "origin", "grossKg", "netKg",
    "goodsLines[].description", "goodsLines[].hsCode", "goodsLines[].quantity",
    "goodsLines[].unit", "goodsLines[].unitPrice", "goodsLines[].lineTotal"
  ];
  const response = await provider.extractInvoice({
    version: "1",
    documentId: "product-e2e-1.3-fiber-beton-image-only",
    evidenceMode: InvoiceLlmEvidenceMode.PAGE_IMAGE,
    requestedFields
  }, pageImages);

  assert.equal(response.model, env.llmVisionModel);
  assert.equal(response.provider, "qwen-ollama-vision");
  assert.ok(response.fields.length > 0, "Vision model hiç field çıkarmadı.");
  for (const field of response.fields) {
    assert.ok(field.evidence.some((e) => e.source === "PAGE_IMAGE" && e.pageNumber === 1), `${field.field}: PAGE_IMAGE evidence yok.`);
  }

  type AccuracyCheck = { name: string; expected: string; actual: string; passed: boolean };
  const checks: AccuracyCheck[] = [];
  const record = (name: string, expected: string, actual: string, passed: boolean): void => {
    checks.push({ name, expected, actual, passed });
  };
  const recordText = (name: string, field: string, expected: string): void => {
    const actual = normalizedText(fieldValue(response.fields, field));
    record(name, expected, actual, actual === expected);
  };
  const recordFirstText = (name: string, field: string, expected: string): void => {
    const actual = normalizedText(first(fieldValue(response.fields, field)));
    record(name, expected, actual, actual === expected);
  };
  const recordContains = (name: string, field: string, expectedDescription: string, needle: string): void => {
    const actual = normalizedText(first(fieldValue(response.fields, field)));
    record(name, expectedDescription, actual, searchFold(actual).includes(searchFold(needle)));
  };
  const recordDigits = (name: string, field: string, expected: string): void => {
    const actual = digits(fieldValue(response.fields, field));
    record(name, expected, actual, actual === expected);
  };
  const recordNumber = (name: string, field: string, expected: number, tolerance = 0.001): void => {
    const actualNumber = localeNumberValue(fieldValue(response.fields, field));
    const passed = Number.isFinite(actualNumber) && Math.abs(actualNumber - expected) <= tolerance;
    record(name, String(expected), Number.isFinite(actualNumber) ? String(actualNumber) : "NaN", passed);
  };

  // Product E2E 1.3.5: collect every ground-truth result before failing.
  // Expected values remain unchanged; row-association hardening must improve the model, not the oracle.
  // Collect every ground-truth result before failing. One early mismatch must not
  // hide the rest of the model's extraction quality for this invoice.
  recordText("invoiceNumber", "invoiceNumber", "AAA2026000000009");
  recordText("currency", "currency", "USD");
  recordText("deliveryTerm", "deliveryTerm", "DAP");
  recordContains("origin", "origin", "contains TÜRK", "TÜRK");
  recordNumber("grossKg", "grossKg", 2320);
  recordNumber("netKg", "netKg", 2250);
  recordDigits("hsCode", "goodsLines[].hsCode", "550340000011");
  recordNumber("quantity", "goodsLines[].quantity", 2250);
  recordFirstText("unit", "goodsLines[].unit", "KG");
  recordNumber("unitPrice", "goodsLines[].unitPrice", 4.1);
  recordNumber("lineTotal", "goodsLines[].lineTotal", 9225);
  recordContains("description", "goodsLines[].description", "contains FIBER", "FIBER");

  const passedCount = checks.filter((check) => check.passed).length;
  const failedChecks = checks.filter((check) => !check.passed);
  console.log(JSON.stringify({
    event: "product-e2e-1.3.real-image-only-qwen-vision.accuracy-report",
    pdf: path.basename(pdfPath),
    model: response.model,
    decision: response.decision,
    imageOnly: true,
    nativeTextProvided: false,
    ocrTextProvided: false,
    pageImageEvidence: true,
    accuracy: {
      passed: passedCount,
      total: checks.length,
      percent: Number(((passedCount / checks.length) * 100).toFixed(1))
    },
    checks
  }, null, 2));

  assert.equal(
    failedChecks.length,
    0,
    `Vision ground truth mismatch: ${failedChecks.map((check) => `${check.name} expected=${check.expected} actual=${check.actual}`).join("; ")}`
  );

  console.log(JSON.stringify({
    event: "product-e2e-1.3.real-image-only-qwen-vision.passed",
    pdf: path.basename(pdfPath),
    model: response.model,
    decision: response.decision,
    imageOnly: true,
    nativeTextProvided: false,
    ocrTextProvided: false,
    pageImageEvidence: true,
    groundTruthChecks: {
      invoiceNumber: true,
      currency: true,
      deliveryTerm: true,
      origin: true,
      grossKg: true,
      netKg: true,
      hsCodeOutsideGoodsTable: true,
      goodsLine: true
    },
    directNormalizedWrite: false
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
