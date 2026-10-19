import assert from "node:assert/strict";
import {
  adaptNaturalInvoiceResponse,
  applyDocumentScopedGoodsOriginAuthority,
  canonicalizeCountryFieldCandidates,
  canonicalizeVisionCountry,
  discoverDocumentScopedGoodsOriginIso,
  evidenceBoundGoodsNumericValue,
  foldInvoiceLatinText,
  isAmountInWordsText,
  isExportShipmentFooterText,
  isNonCommercialGoodsLine,
  preferArithmeticLocaleReading,
  recoverCommercialQuantityAfterPackagingReject,
  sanitizeNaturalGoodsLines,
  sanitizeVisionUnit
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
// Vision may invent monetary fields / short numeric "HS" on the amount-in-words
// line — still a footer. Amount-in-words description always wins.
assert.equal(
  isNonCommercialGoodsLine({
    description: "ALTIMISBIRBINONBIR EUR VE DOKSANSEKIZ CENT",
    productCode: "301-11/1",
    hsCode: "105851",
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
assert.equal(canonicalizeVisionCountry("THAILAND"), "TH");
assert.equal(canonicalizeVisionCountry("POLAND"), "PL");

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

// 8.25.6: European unit-price "106,800" / semantic 106800 + qty×total → 106.8.
assert.equal(
  preferArithmeticLocaleReading(
    { quantity: 15, unitPrice: 106800, lineTotal: 1602 } as never,
    "unitPrice",
    106800
  ),
  106.8
);
assert.equal(
  evidenceBoundGoodsNumericValue(
    {
      quantity: 15,
      unitPrice: 106800,
      lineTotal: 1602,
      evidence: { unitPrice: { header: "Unit Price", rawValue: "106,800" } }
    } as never,
    "unitPrice"
  ),
  106.8
);
assert.equal(
  evidenceBoundGoodsNumericValue(
    { quantity: 1, unitPrice: 560, lineTotal: 560 } as never,
    "unitPrice"
  ),
  560
);

// Document-scoped goods origin overrides uniform party-leak row origins.
const originOverride = sanitizeNaturalGoodsLines([
  {
    productCode: "A1",
    description: "Item one",
    hsCode: "761699909019",
    quantity: 10,
    unit: "ADET",
    unitPrice: 2,
    lineTotal: 20,
    origin: "HU"
  },
  {
    productCode: "A2",
    description: "Item two",
    hsCode: "761699909019",
    quantity: 5,
    unit: "ADET",
    unitPrice: 3,
    lineTotal: 15,
    origin: "Hungary"
  },
  {
    description: "MALLARIMIZ TURK MENSEILIDIR.",
    unit: "PALET",
    origin: "TR"
  }
] as never[]);
assert.equal(originOverride.length, 2);
assert.equal(originOverride[0]?.origin, "TR");
assert.equal(originOverride[1]?.origin, "TR");

// Packaging-unit export footer with invented order-like HS is not a goods row.
assert.equal(isExportShipmentFooterText("a Mal ihracati"), true);
assert.equal(
  isNonCommercialGoodsLine({
    description: "a Mal ihracati",
    unit: "PALET",
    quantity: 66,
    unitPrice: 151.51515151515153,
    lineTotal: 10000,
    hsCode: "301-11/1",
    productCode: "301-11/1",
    origin: "TR"
  } as never),
  true
);
const celikelSanitized = sanitizeNaturalGoodsLines([
  {
    productCode: "A5E300959905FCO",
    description: "Montaj",
    hsCode: "761699909019",
    quantity: 1600,
    unit: "ADET",
    unitPrice: 24.9378,
    lineTotal: 39900.48,
    origin: "Hungary"
  },
  {
    description: "a Mal ihracati",
    unit: "PALET",
    quantity: 66,
    unitPrice: 151.51515151515153,
    lineTotal: 10000,
    hsCode: "301-11/1",
    productCode: "301-11/1",
    origin: "TR"
  }
] as never[]);
assert.equal(celikelSanitized.length, 1);
assert.equal(celikelSanitized[0]?.origin, "TR");

// YEM-class: packaging unit recovery must survive later evidence re-bind.
const yemRecovered = recoverCommercialQuantityAfterPackagingReject({
  quantity: 1250,
  unit: "Koli",
  unitPrice: 0.7,
  lineTotal: 17500,
  evidence: { quantity: { header: "Miktar", rawValue: "1.250" } }
} as never);
assert.equal(yemRecovered.quantity, 25000);
assert.equal(yemRecovered.unit, null);
assert.equal(yemRecovered.evidence?.quantity, undefined);
const yemSanitized = sanitizeNaturalGoodsLines([{
  quantity: 1250,
  unit: "Koli",
  unitPrice: 0.7,
  lineTotal: 17500,
  origin: "TR",
  productCode: "91101",
  hsCode: "020714990012",
  description: "Tavuk",
  evidence: { quantity: { header: "Miktar", rawValue: "1.250" } }
}] as never[]);
assert.equal(yemSanitized.length, 1);
assert.equal(yemSanitized[0]?.quantity, 25000);
assert.equal(yemSanitized[0]?.unit, null);

// Mixed per-row origins are not overwritten by a document origin statement.
const mixedOrigins = sanitizeNaturalGoodsLines([
  {
    productCode: "P1",
    description: "A",
    hsCode: "853620900019",
    quantity: 1,
    unitPrice: 10,
    lineTotal: 10,
    origin: "PL"
  },
  {
    productCode: "P2",
    description: "B",
    hsCode: "853620900019",
    quantity: 1,
    unitPrice: 10,
    lineTotal: 10,
    origin: "CN"
  },
  {
    description: "MALLARIMIZ TURK MENSEILIDIR.",
    origin: "TR"
  }
] as never[]);
assert.equal(mixedOrigins.length, 2);
assert.equal(mixedOrigins[0]?.origin, "PL");
assert.equal(mixedOrigins[1]?.origin, "CN");

// NFKD fold must not insert spaces inside TÜRK / MENŞEİLİDİR.
assert.match(foldInvoiceLatinText("MALLARIMIZ TÜRK MENŞEİLİDİR."), /TURK/);
assert.equal(
  discoverDocumentScopedGoodsOriginIso("EXW\nMALLARIMIZ TÜRK MENŞEİLİDİR.\nTOPLAM KAP : 66 PALET"),
  "TR"
);
assert.equal(
  discoverDocumentScopedGoodsOriginIso("Country of Origin of Goods\nINDIA\nCountry of Final Destination"),
  "IN"
);
assert.equal(sanitizeVisionUnit("P??ECES"), "PIECES");
assert.equal(sanitizeVisionUnit("pcs"), "PCS");

// Apostrophe thousands grouping (Swiss/German invoices).
assert.equal(
  evidenceBoundGoodsNumericValue(
    {
      quantity: 2000,
      unitPrice: 5.25,
      lineTotal: 10,
      evidence: { lineTotal: { header: "Total EUR", rawValue: "10’500.00" } }
    } as never,
    "lineTotal"
  ),
  10500
);
assert.equal(
  evidenceBoundGoodsNumericValue(
    {
      quantity: 2000,
      unitPrice: 5.25,
      lineTotal: 10500,
      evidence: { quantity: { header: "Menge", rawValue: "2000" } }
    } as never,
    "quantity"
  ),
  2000
);
assert.equal(
  evidenceBoundGoodsNumericValue(
    {
      quantity: 2000,
      unitPrice: 5.25,
      lineTotal: 10500,
      evidence: { unitPrice: { header: "Stückpreis(EUR)", rawValue: "5.25" } }
    } as never,
    "unitPrice"
  ),
  5.25
);

// qty×price completes missing lineTotal when amount evidence is absent.
const wylCompleted = sanitizeNaturalGoodsLines([
  {
    description: "Metal tube 35mm",
    quantity: 500,
    unitPrice: 1.52,
    lineTotal: null
  },
  {
    description: "Metal tube 38mm",
    quantity: 1250,
    unitPrice: 2.16
  }
] as never[]);
assert.equal(wylCompleted[0]?.lineTotal, 760);
assert.equal(wylCompleted[1]?.lineTotal, 2700);
assert.equal(wylCompleted[0]?.origin ?? null, null);

// Wrong-role lineTotal evidence must not survive when qty×price corroborates.
const adaptedTotals = adaptNaturalInvoiceResponse(
  {
    goodsLines: [
      {
        description: "Metal tube 35mm",
        quantity: 500,
        unitPrice: 1.52,
        lineTotal: 760,
        evidence: { lineTotal: { header: "Unit Price", rawValue: "760" } }
      }
    ]
  } as never,
  {
    documentId: "contract",
    requestedFields: ["goodsLines[].lineTotal", "goodsLines[].quantity", "goodsLines[].unitPrice"]
  } as never,
  [{ pageNumber: 1, imageBase64: "", mimeType: "image/png" }] as never
);
assert.deepEqual(
  adaptedTotals.fields.find((field) => field.field === "goodsLines[].lineTotal")?.value,
  [760]
);
assert.equal(sanitizeVisionUnit("P\uFFFD\uFFFDECES"), "PIECES");

// Cross-page document-scoped origin authority on fused candidates.
const fusedOverride = applyDocumentScopedGoodsOriginAuthority(
  {
    version: "1",
    fields: {
      "goodsLines.0.productCode": [{
        candidateId: "p0",
        field: "goodsLines.0.productCode",
        value: "A1",
        confidence: 0.9,
        extractor: "test",
        evidence: []
      }],
      "goodsLines.0.origin": [{
        candidateId: "o0",
        field: "goodsLines.0.origin",
        value: "HU",
        confidence: 0.9,
        extractor: "test",
        evidence: []
      }],
      "goodsLines.1.productCode": [{
        candidateId: "p1",
        field: "goodsLines.1.productCode",
        value: "A2",
        confidence: 0.9,
        extractor: "test",
        evidence: []
      }],
      "goodsLines.1.origin": [{
        candidateId: "o1",
        field: "goodsLines.1.origin",
        value: "HU",
        confidence: 0.9,
        extractor: "test",
        evidence: []
      }]
    }
  },
  "TR",
  "seg-clk"
);
assert.equal(fusedOverride.fields["goodsLines.0.origin"]?.[0]?.value, "TR");
assert.equal(fusedOverride.fields["goodsLines.1.origin"]?.[0]?.value, "TR");

console.log({
  event: "foundation-8.25.5.commercial-row-sanitizer.contract.passed",
  packagingRejectRecoversCorroboratedQuantity: true,
  packagingUnitNullQtyRecovers: true,
  footerOriginNotGoodsRow: true,
  amountInWordsNotGoodsRow: true,
  documentOriginBroadcast: true,
  documentOriginOverridesUniformPartyLeak: true,
  mixedRowOriginsPreserved: true,
  localeUnitPriceArithmeticRepair: true,
  exportShipmentFooterDropped: true,
  packagingRecoveryClearsQuantityEvidence: true,
  countryIsoCanonicalization: true,
  countryCandidateRewrite: true,
  voltaBaselinePreserved: true,
  foldInvoiceLatinKeepsTurkToken: true,
  documentScopedOriginDiscoverFromCanonicalText: true,
  apostropheThousandsEvidence: true,
  germanMengeStuckpreisHeaders: true,
  lineTotalFromQtyPriceWhenAmountMissing: true,
  unitMojibakeRepair: true,
  fusedDocumentScopedOriginOverride: true,
  corpusSpecificRules: false
});
