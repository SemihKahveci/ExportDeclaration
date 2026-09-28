import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";

type GroundTruthCase = {
  id: string;
  pdf: string;
  expected: {
    invoiceNumber: string;
    currency: string;
    deliveryTerm?: string;
    firstGoodsLine: {
      descriptionContains: string;
      hsCode: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      lineTotal: number;
    };
  };
};

const ROOT = "/app/uploads/product-e2e";

// Fixed, source-verified expectations only. Customer PDFs remain local/ignored.
const CASES: GroundTruthCase[] = [
  {
    id: "clk-celikel",
    pdf: "CLK2026000001021.pdf",
    expected: {
      invoiceNumber: "CLK2026000001021",
      currency: "EUR",
      deliveryTerm: "EXW",
      firstGoodsLine: {
        descriptionContains: "INVERTER HOUSING",
        hsCode: "761699909019",
        quantity: 1600,
        unit: "ADET",
        unitPrice: 24.9378,
        lineTotal: 39900.48,
      },
    },
  },
  {
    id: "textilium",
    pdf: "792CD3D2-CAAE-4E7B-978F-C1FE94E50709.pdf",
    expected: {
      invoiceNumber: "TXT2026000000091",
      currency: "EUR",
      deliveryTerm: "CIP",
      firstGoodsLine: {
        descriptionContains: "ERKEK",
        hsCode: "610510000000",
        quantity: 569,
        unit: "ADET",
        unitPrice: 14.8,
        lineTotal: 8421.2,
      },
    },
  },
  {
    id: "makro-boya",
    pdf: "IHR2026000000035_FAISAL SOUDİ~21770191.pdf",
    expected: {
      invoiceNumber: "IHR2026000000035",
      currency: "USD",
      deliveryTerm: "EXW",
      firstGoodsLine: {
        descriptionContains: "TYLOSE 100000",
        hsCode: "391239850000",
        quantity: 1575,
        unit: "KG",
        unitPrice: 7.75,
        lineTotal: 12206.25,
      },
    },
  },
  {
    id: "fiber-beton",
    pdf: "AAA2026000000009.pdf",
    expected: {
      invoiceNumber: "AAA2026000000009",
      currency: "USD",
      deliveryTerm: "DAP",
      firstGoodsLine: {
        descriptionContains: "MACRO SYNTHETIC FIBER REINFORCEMENT",
        hsCode: "550340000011",
        quantity: 2250,
        unit: "KG",
        unitPrice: 4.1,
        lineTotal: 9225,
      },
    },
  },
];

async function main(): Promise<void> {
  assert.ok(CASES.length >= 4, "Product corpus must contain at least four heterogeneous invoices.");
  assert.equal(new Set(CASES.map((item) => item.id)).size, CASES.length, "Corpus ids must be unique.");
  assert.equal(new Set(CASES.map((item) => item.pdf)).size, CASES.length, "Corpus PDF names must be unique.");

  const available: string[] = [];
  const missing: string[] = [];
  for (const testCase of CASES) {
    assert.match(testCase.expected.invoiceNumber, /^[A-Z0-9-]+$/i);
    assert.match(testCase.expected.currency, /^[A-Z]{3}$/);
    assert.match(testCase.expected.firstGoodsLine.hsCode, /^\d{12}$/, `${testCase.id}: GTIP must be 12 digits.`);
    assert.ok(Number.isFinite(testCase.expected.firstGoodsLine.quantity));
    assert.ok(Number.isFinite(testCase.expected.firstGoodsLine.unitPrice));
    assert.ok(Number.isFinite(testCase.expected.firstGoodsLine.lineTotal));
    try {
      await access(path.join(ROOT, testCase.pdf));
      available.push(testCase.id);
    } catch {
      missing.push(testCase.id);
    }
  }

  assert.equal(
    missing.length,
    0,
    `Local product corpus is incomplete under ${ROOT}. Missing cases: ${missing.join(", ")}`,
  );

  console.log(JSON.stringify({
    event: "product-e2e-1.5.0.corpus-ground-truth-contract.passed",
    corpusCases: CASES.length,
    localCustomerPdfsAvailable: available.length,
    fixedGroundTruth: true,
    twelveDigitGtipGuard: true,
    duplicateCaseGuard: true,
    customerPdfsCommitted: false,
    directNormalizedWrite: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
