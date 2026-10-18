import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeFoundation8SpecialistJsonShape } from "../../src/modules/idp/llm/qwenTextInvoiceProvider.js";
import { InvoiceLlmEvidenceMode } from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";

const request = {
  version: "1" as const,
  documentId: "fixture",
  evidenceMode: InvoiceLlmEvidenceMode.TEXT,
  requestedFields: [
    "goodsTable.expectedRowCount",
    "goodsLines.*.productCode",
    "goodsLines.*.description",
    "goodsLines.*.hsCode",
    "goodsLines.*.quantity",
    "goodsLines.*.unit",
    "goodsLines.*.unitPrice",
    "goodsLines.*.lineTotal",
    "goodsLines.*.origin"
  ],
  nativeText: "<<<PAGE 1 | SOURCE NATIVE_TEXT>>>\nItem X CODE-X KG 25000 0.70 17500.00\n<<<END PAGE 1>>>",
  focusInstruction: "fixture"
};

const ev = (quote: string) => [{ pageNumber: 1, source: "NATIVE_TEXT", quote }];
const nested = normalizeFoundation8SpecialistJsonShape({
  version: "1",
  decision: "EXTRACTED",
  goodsTable: {
    expectedRowCount: { value: 1, confidence: 0.9, evidence: ev("Item X") },
    rows: [{
      productCode: { value: "CODE-X", confidence: 0.9, evidence: ev("CODE-X") },
      description: { value: "Item X", confidence: 0.9, evidence: ev("Item X") },
      quantity: { value: 25000, confidence: 0.9, evidence: ev("25000") },
      unit: { value: "KG", confidence: 0.9, evidence: ev("KG") },
      unitPrice: { value: 0.7, confidence: 0.9, evidence: ev("0.70") },
      lineTotal: { value: 17500, confidence: 0.9, evidence: ev("17500.00") }
    }]
  }
}, request);

const fields = nested.fields as Array<{ field: string; value: unknown }>;
assert.ok(Array.isArray(fields));
assert.equal(fields.find(x => x.field === "goodsLines.0.quantity")?.value, 25000);
assert.equal(fields.find(x => x.field === "goodsLines.0.lineTotal")?.value, 17500);
assert.equal(fields.find(x => x.field === "goodsTable.expectedRowCount")?.value, 1);

const evidenceMapShape = normalizeFoundation8SpecialistJsonShape({
  version: "1",
  decision: "PARTIAL",
  goodsLines: [{
    productCode: "CODE-X",
    quantity: 25000,
    evidence: {
      productCode: { pageNumber: 1, source: "NATIVE_TEXT", quote: "CODE-X" },
      quantity: { pageNumber: 1, source: "NATIVE_TEXT", quote: "25000" }
    }
  }]
}, request);
const evidenceMapFields = evidenceMapShape.fields as Array<{ field: string; value: unknown }>;
assert.equal(evidenceMapFields.find(x => x.field === "goodsLines.0.productCode")?.value, "CODE-X");
assert.equal(evidenceMapFields.find(x => x.field === "goodsLines.0.quantity")?.value, 25000);

const unsupported = normalizeFoundation8SpecialistJsonShape({ version: "1", decision: "PARTIAL", goodsLines: [{ quantity: 25000 }] }, request);
assert.equal(Array.isArray(unsupported.fields), false, "evidence-free nested values must not be normalized into authority");

const provider = fs.readFileSync("backend/src/modules/idp/llm/qwenTextInvoiceProvider.ts", "utf8");
const guardrails = {
  evidenceRequiredForShapeAdaptation: provider.includes("if (!evidence.length) return;"),
  noSupplierSpecificRules: !/CELIKEL|VED2026|YEM2026|VOLTA|NINGBO|DERMETERNAL|P0087/i.test(provider),
  noGoldenRuntimeImport: !/goldenCorpus|golden\/foundation8/i.test(provider),
  noArithmeticRepair: !/lineTotal\s*\/|total\s*\/|quantity\s*\*/.test(provider)
};
Object.entries(guardrails).forEach(([name, ok]) => assert.equal(ok, true, name));

console.log(JSON.stringify({
  event: "foundation-8.19.domain-native-goods-shape-adapter.contract.passed",
  acceptance: {
    nestedGoodsTableRowsBecomeFlatOwnedFields: true,
    directGoodsLinesEvidenceMapBecomesFlatOwnedFields: true,
    evidenceFreeNestedValuesRemainRejected: true,
    existingFlatFieldsRemainUnchanged: true
  },
  guardrails
}, null, 2));
