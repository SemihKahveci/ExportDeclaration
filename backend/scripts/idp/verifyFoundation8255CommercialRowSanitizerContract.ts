import assert from "node:assert/strict";
import {
  canonicalizeCountryFieldCandidates,
  canonicalizeVisionCountry,
  evidenceBoundGoodsNumericValue,
  isAmountInWordsText,
  isNonCommercialGoodsLine,
  recoverCommercialQuantityAfterPackagingReject,
  sanitizeNaturalGoodsLines
} from "../../src/modules/idp/llm/qwenVisionInvoiceProvider.js";

// Packaging evidence still cannot authorize quantity.
assert.equal(
  evidenceBoundGoodsNumericValue(
    {
      quantity: 1250,
      unitPrice: 0.7,
      lineTotal: 875,
      evidence: { quantity: { header: "Koli", rawValue: "1250", unit: "KOLI" } }
    } as never,
    "quantity"
  ),
  null
);

// After packaging evidence reject, recover commercial qty from corroborated price/total.
const recovered = recoverCommercialQuantityAfterPackagingReject({
  quantity: 1250,
  unit: "KOLI",
  unitPrice: 0.7,
  lineTotal: 17500,
  evidence: { quantity: { header: "Carton", rawValue: "1.250", unit: "CTN" } }
} as never);
assert.equal(recovered.quantity, 25000);
assert.equal(recovered.unit, null);
assert.equal(recovered.evidence?.quantity, undefined);

// 8.25.6: packaging UNIT + null quantity (no structured evidence) still recovers.
const recoveredFromUnit = recoverCommercialQuantityAfterPackagingReject({
  quantity: null,
  unit: "KOLI",
  unitPrice: 0.7,
  lineTotal: 17500
} as never);
assert.equal(recoveredFromUnit.quantity, 25000);
assert.equal(recoveredFromUnit.unit, null);

// Do not recover when arithmetic would equal the packaging count.
const packagingEqualsCommercial = recoverCommercialQuantityAfterPackagingReject({
  quantity: 48,
  unit: "CTN",
  unitPrice: 10,
  lineTotal: 480,
  evidence: { quantity: { header: "Carton", rawValue: "48", unit: "CTN" } }
} as never);
assert.equal(packagingEqualsCommercial.quantity, null);

// Origin declaration / footer is not a commercial goods row.
assert.equal(
  isNonCommercialGoodsLine({
    description: "MALLARIMIZ TURK MENSEILIDIR.",
    unit: "PALET",
    origin: "TURKIYE"
  } as never),
  true
);

// Amount-in-words totals footer is not a commercial goods row.
assert.equal(
  isAmountInWordsText("ALTMIŞBİRİNBİR EUR VE DOKSANSEKİZ CENT"),
  true
);
assert.equal(
  isNonCommercialGoodsLine({
    description: "ALTMIŞBİRİNBİR EUR VE DOKSANSEKİZ CENT",
    unit: "PALET",
    origin: "TR"
  } as never),
  true
);
// Vision may invent monetary fields on the amount-in-words line — still a footer
// unless a real product/HS catalog identity is present.
assert.equal(
  isNonCommercialGoodsLine({
    description: "ALTIMISBIRBINONBIR EUR VE DOKSANSEKIZ CENT",
    productCode: "301-11/1",
    unitPrice: 151.51515151515153,
    lineTotal: 10000,
    origin: "TR"
  } as never),
  true
);
assert.equal(
  isAmountInWordsText("ALTIMISBIRBINONBIR EUR VE DOKSANSEKIZ CENT"),
  true
);

// Healthy commercial rows remain commercial.
assert.equal(
  isNonCommercialGoodsLine({
    productCode: "ABC-1",
    description: "Widget",
    hsCode: "123456789012",
    quantity: 1,
    unit: "ADET",
    unitPrice: 560,
    lineTotal: 560,
    origin: "TR"
  } as never),
  false
);

const sanitized = sanitizeNaturalGoodsLines([
  {
    productCode: "A1",
    description: "Item one",
    hsCode: "761699909019",
    quantity: 10,
    unit: "ADET",
    unitPrice: 2,
    lineTotal: 20
  },
  {
    description: "ALTMIŞBİRİNBİR EUR VE DOKSANSEKİZ CENT",
    unit: "PALET",
    origin: "TR"
  },
  {
    productCode: "A2",
    description: "Item two",
    hsCode: "761699909019",
    quantity: null,
    unit: "KOLI",
    unitPrice: 0.7,
    lineTotal: 17500
  }
] as never[]);

assert.equal(sanitized.length, 2);
assert.equal(sanitized[0]?.origin, "TR");
assert.equal(sanitized[1]?.origin, "TR");
assert.equal(sanitized[1]?.quantity, 25000);
assert.equal(sanitized[1]?.unit, null);
assert.equal(canonicalizeVisionCountry("ESTONYA"), "EE");
assert.equal(canonicalizeVisionCountry("Türkiye"), "TR");
assert.equal(canonicalizeVisionCountry("POLAND"), "PL");
assert.equal(canonicalizeVisionCountry("Somewhereia"), undefined);

const countryEnvelope = canonicalizeCountryFieldCandidates({
  version: "1",
  fields: {
    "parties.buyer.country": [
      {
        candidateId: "c1",
        field: "parties.buyer.country",
        value: "ESTONYA",
        confidence: 0.9,
        extractor: "test",
        evidence: []
      }
    ],
    "goodsLines.0.origin": [
      {
        candidateId: "c2",
        field: "goodsLines.0.origin",
        value: "POLAND",
        confidence: 0.9,
        extractor: "test",
        evidence: []
      }
    ]
  }
});
assert.equal(countryEnvelope.fields["parties.buyer.country"]?.[0]?.value, "EE");
assert.equal(countryEnvelope.fields["goodsLines.0.origin"]?.[0]?.value, "PL");

// Baseline: no packaging evidence keeps semantic quantity (Volta-class).
assert.equal(
  evidenceBoundGoodsNumericValue({ quantity: 1, unitPrice: 560, lineTotal: 560 } as never, "quantity"),
  1
);

console.log({
  event: "foundation-8.25.5.commercial-row-sanitizer.contract.passed",
  packagingRejectRecoversCorroboratedQuantity: true,
  packagingUnitNullQtyRecovers: true,
  footerOriginNotGoodsRow: true,
  amountInWordsNotGoodsRow: true,
  documentOriginBroadcast: true,
  countryIsoCanonicalization: true,
  countryCandidateRewrite: true,
  voltaBaselinePreserved: true,
  corpusSpecificRules: false
});
