import assert from "node:assert/strict";
import { loadAllGoldenCases, loadGoldenCase } from "./foundation8/goldenCorpus.js";
import { scoreGoldenInvoice } from "./foundation8/goldenCorpusScorer.js";
import type { Foundation8ActualInvoice, GoldenInvoiceCase } from "./foundation8/goldenCorpus.types.js";

function goldenAsActual(golden: GoldenInvoiceCase): Foundation8ActualInvoice {
  return {
    scalars: { ...golden.expected.scalars },
    goodsRows: Array.from({ length: golden.expected.exactGoodsRowCount }, (_, index) => {
      const expected = golden.expected.goodsRows.find(row => row.rowNo === index + 1);
      if (!expected) {
        // The gate contract does not invent unspecified rows. A complete neutral row only
        // exercises the corpus-wide completeness rule; real actual snapshots must supply them.
        return Object.fromEntries(golden.expected.requiredGoodsFields.map(field => [field, `CONTRACT-${index + 1}-${field}`]));
      }
      return {
        productCode: expected.productCode,
        description: expected.descriptionContains,
        hsCode: expected.hsCode,
        quantity: expected.quantity,
        unit: expected.unit,
        unitPrice: expected.unitPrice,
        lineTotal: expected.lineTotal,
        origin: expected.origin
      };
    })
  };
}

const cases = loadAllGoldenCases();
assert.equal(cases.length, 7);

// The gate itself must accept a truth-conformant snapshot for every frozen case.
for (const golden of cases) {
  const score = scoreGoldenInvoice(golden, goldenAsActual(golden));
  assert.equal(score.pass, true, `${golden.id} truth-conformant snapshot must pass`);
}

// VED: 56 HS tokens are not 56 commercial rows. Every required row must be atomic/complete.
const ved = loadGoldenCase("ved146");
const vedSkeleton: Foundation8ActualInvoice = {
  scalars: { ...ved.expected.scalars },
  goodsRows: Array.from({ length: 56 }, (_, index) => index === 0 ? {
    productCode: "AG.SCH.C25B4", description: "C25B4 BASIC FRAME", hsCode: "853620900019",
    quantity: 15, unit: "ADET", unitPrice: 106.8, lineTotal: 1602, origin: "POLAND"
  } : { hsCode: "853620900019" })
};
const vedScore = scoreGoldenInvoice(ved, vedSkeleton);
assert.equal(vedScore.pass, false);
assert.equal(vedScore.summary.completeRows, 1);

// YEM: package count cannot replace commercial quantity; derived arithmetic cannot legitimize it.
const yem = loadGoldenCase("yem");
const yemScore = scoreGoldenInvoice(yem, {
  scalars: { ...yem.expected.scalars },
  goodsRows: [{ productCode:"91101", description:"Tavuk İşlenmiş Ayak A Kalite", hsCode:"020714990012", quantity:1250, unit:"KG", unitPrice:0.7, lineTotal:875, origin:"TR" }]
});
assert.equal(yemScore.pass, false);

// Volta: amount cannot become quantity and description token cannot replace product code.
const volta = loadGoldenCase("volta");
const voltaScore = scoreGoldenInvoice(volta, {
  scalars: { ...volta.expected.scalars },
  goodsRows: [{ productCode:"PS4", description:"PS4 GASOLINE SCOOTER (50CC) BLUE", hsCode:"871110000011", quantity:560, unit:"ADET", unitPrice:560, lineTotal:560, origin:"TR" }]
});
assert.equal(voltaScore.pass, false);

// PML: document total is mandatory and 8-digit HSN must not be fabricated into GTIP.
const pml = loadGoldenCase("pml");
const pmlActual = goldenAsActual(pml);
pmlActual.scalars.totalAmount = undefined;
pmlActual.goodsRows[0]!.hsCode = "39269099";
const pmlScore = scoreGoldenInvoice(pml, pmlActual);
assert.equal(pmlScore.pass, false);
assert.ok(pmlScore.failures.some(f => f.path === "totalAmount"));
assert.ok(pmlScore.failures.some(f => f.path === "goodsRows.1.hsCode"));

// Unsupported HS/unit fields are fail-closed, not opportunities to hallucinate values.
for (const id of ["dermeternal", "ningbo"] as const) {
  const golden = loadGoldenCase(id);
  const actual = goldenAsActual(golden);
  actual.goodsRows[0]!.hsCode = "999999999999";
  if (id === "ningbo") actual.goodsRows[0]!.unit = "PCS";
  const score = scoreGoldenInvoice(golden, actual);
  assert.equal(score.pass, false, `${id} fabricated unsupported goods fields must fail`);
  assert.ok(score.failures.some(f => f.kind === "FORBIDDEN"));
}

// Çelikel: buyer/delivery geography must not become unsupported originCountry.
const celikel = loadGoldenCase("celikel");
const celikelActual = goldenAsActual(celikel);
celikelActual.scalars.originCountry = "Hungary";
const celikelScore = scoreGoldenInvoice(celikel, celikelActual);
assert.equal(celikelScore.pass, false);

console.log(JSON.stringify({
  event: "foundation-8.7.seven-invoice-zero-regression-gate.contract.passed",
  cases: cases.map(c => c.id),
  acceptance: {
    sevenGoldenCasesRequired: true,
    truthConformantSnapshotsPass: true,
    vedRequires56AtomicCompleteRows: !vedScore.pass && vedScore.summary.completeRows === 1,
    yemPackagingQuantitySwapFails: !yemScore.pass,
    voltaAmountQuantityAndProductCodeSwapFails: !voltaScore.pass,
    pmlMissingTotalAndFabricatedHsFail: !pmlScore.pass,
    dermeternalUnsupportedHsFailsClosed: true,
    ningboUnsupportedHsAndUnitFailClosed: true,
    celikelUnsupportedHungaryOriginFails: !celikelScore.pass
  },
  guardrails: {
    goldenExpectedFilesAreEvalOnly: true,
    productionRuntimeImportsGoldenCorpus: false,
    modelOrOcrRequired: false,
    databaseMutation: false,
    supplierSpecificProductionRules: false,
    invoiceSpecificProductionConstants: false,
    directNormalizedWrite: false
  }
}, null, 2));
