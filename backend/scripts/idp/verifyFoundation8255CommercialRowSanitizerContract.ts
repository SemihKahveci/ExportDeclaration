import assert from "node:assert/strict";
import { DocumentType } from "../../src/common/enums/documentType.js";
import { resolveDeclarationFields } from "../../src/modules/idp/domain/declarationFieldResolver.js";
import type { DeclarationFieldCandidateEnvelope } from "../../src/modules/idp/domain/declarationFieldCandidate.types.js";
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

// VED-class: separator-dropped semantic + locale evidence → document token wins.
// Arithmetic corroborates the evidence reading; it must not invent qty×price.
assert.equal(
  evidenceBoundGoodsNumericValue(
    {
      quantity: 1,
      unitPrice: 29.57,
      lineTotal: 295700,
      evidence: { lineTotal: { header: "Amount", rawValue: "29,5700" } }
    } as never,
    "lineTotal"
  ),
  29.57
);
const vedEvidenceRecovered = sanitizeNaturalGoodsLines([
  {
    description: "A",
    quantity: 1,
    unitPrice: 28.77,
    lineTotal: 28770,
    unit: "ADET",
    evidence: { lineTotal: { header: "Amount", rawValue: "28,7700" } }
  },
  {
    description: "B",
    quantity: 2,
    unitPrice: 18.08,
    lineTotal: 3616,
    unit: "ADET",
    evidence: { lineTotal: { header: "Amount", rawValue: "36,16" } }
  }
] as never[]);
assert.equal(vedEvidenceRecovered[0]?.lineTotal, 28.77);
assert.equal(vedEvidenceRecovered[1]?.lineTotal, 36.16);

// Clean scale blows of an already-present qty and unit price repair to that product.
// A non-scale severe mismatch stays unchanged for declaration review.
const vedScaleRepaired = sanitizeNaturalGoodsLines([
  { description: "A", quantity: 1, unitPrice: 28.77, lineTotal: 28770, unit: "ADET" },
  { description: "B", quantity: 2, unitPrice: 18.08, lineTotal: 18080, unit: "ADET" },
  { description: "C", quantity: 10, unitPrice: 9.72, lineTotal: 9720, unit: "ADET" },
  { description: "D", quantity: 2, unitPrice: 900.2, lineTotal: 900200, unit: "ADET" },
  { description: "E", quantity: 4, unitPrice: 106.8, lineTotal: 427200, unit: "ADET" },
  // Mid-scale inflate (×7–9) is not a clean scale and is not rewritten.
  { description: "F", quantity: 36, unitPrice: 106.8, lineTotal: 28770, unit: "ADET" }
] as never[]);
assert.equal(vedScaleRepaired[0]?.lineTotal, 28.77);
assert.equal(vedScaleRepaired[1]?.lineTotal, 36.16);
assert.equal(vedScaleRepaired[2]?.lineTotal, 97.2);
assert.equal(vedScaleRepaired[3]?.lineTotal, 1800.4);
assert.equal(vedScaleRepaired[4]?.lineTotal, 427.2);
assert.equal(vedScaleRepaired[5]?.lineTotal, 28770);

// Çelikel-class: evidence "1.600" + price×total → quantity 1600 (not 1.6).
assert.equal(
  evidenceBoundGoodsNumericValue(
    {
      quantity: 1600,
      unitPrice: 24.9378,
      lineTotal: 39900.48,
      evidence: { quantity: { header: "Miktar", rawValue: "1.600", unit: "Adet" } }
    } as never,
    "quantity"
  ),
  1600
);
assert.equal(
  evidenceBoundGoodsNumericValue(
    {
      quantity: 1.6,
      unitPrice: 24.9378,
      lineTotal: 39900.48,
      evidence: { quantity: { header: "Miktar", rawValue: "1.600", unit: "Adet" } }
    } as never,
    "quantity"
  ),
  1600
);

// Origin/menşe footer with invented HS/product/price is still non-commercial.
assert.equal(
  isNonCommercialGoodsLine({
    description: "MALLARIMIZ TÜRK MENŞEİLDİR.",
    productCode: "301-11/1",
    hsCode: "301-11/1",
    quantity: 66,
    unit: "PALET",
    unitPrice: 151.51515151515153,
    lineTotal: 10000,
    origin: "TR"
  } as never),
  true
);
const celikelFooterDropped = sanitizeNaturalGoodsLines([
  {
    productCode: "A5E30095990SFCO",
    description: "Inverter Housing",
    hsCode: "761699909019",
    quantity: 1600,
    unit: "ADET",
    unitPrice: 24.9378,
    lineTotal: 39900.48,
    origin: "Hungary"
  },
  {
    description: "MALLARIMIZ TÜRK MENŞEİLDİR.",
    productCode: "301-11/1",
    hsCode: "301-11/1",
    quantity: 66,
    unit: "PALET",
    unitPrice: 151.52,
    lineTotal: 10000,
    origin: "TR"
  }
] as never[]);
assert.equal(celikelFooterDropped.length, 1);
assert.equal(celikelFooterDropped[0]?.origin, "TR");
assert.equal(celikelFooterDropped[0]?.quantity, 1600);

// FOC / explicit zero totals must not be overwritten by qty×price.
const focPreserved = sanitizeNaturalGoodsLines([
  { description: "FOC", quantity: 200, unitPrice: 5.25, lineTotal: 0, unit: "PCS", origin: "IT" }
] as never[]);
assert.equal(focPreserved[0]?.lineTotal, 0);

// Modest non-matching totals (discount) are not force-rejected.
const discountKept = sanitizeNaturalGoodsLines([
  { description: "Disc", quantity: 10, unitPrice: 9.72, lineTotal: 90, unit: "ADET" }
] as never[]);
assert.equal(discountKept[0]?.lineTotal, 90);

// Healthy corroborating totals stay untouched (Volta/Derm class).
const healthyKept = sanitizeNaturalGoodsLines([
  { description: "Ok", quantity: 15, unitPrice: 106.8, lineTotal: 1602, unit: "ADET" },
  { description: "Ok2", quantity: 2000, unitPrice: 5.25, lineTotal: 10500, unit: "PCS" }
] as never[]);
assert.equal(healthyKept[0]?.lineTotal, 1602);
assert.equal(healthyKept[1]?.lineTotal, 10500);

// YEM commercial total must survive: packaging qty would make qty×price invent 875.
const yemTotalPreserved = sanitizeNaturalGoodsLines([{
  description: "Tavuk",
  productCode: "91101",
  hsCode: "020714990012",
  quantity: 1250,
  unit: "Koli",
  unitPrice: 0.7,
  lineTotal: 17500,
  origin: "TR",
  evidence: { quantity: { header: "Miktar", rawValue: "1.250" } }
}] as never[]);
assert.equal(yemTotalPreserved[0]?.quantity, 25000);
assert.equal(yemTotalPreserved[0]?.lineTotal, 17500);

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

// Visible amount evidence recovers locale magnitude; wrong-role amount token fails closed.
const adaptedVed = adaptNaturalInvoiceResponse(
  {
    goodsLines: [
      {
        description: "Breaker",
        quantity: 2,
        unitPrice: 18.08,
        lineTotal: 3616,
        unit: "ADET",
        evidence: { lineTotal: { header: "Amount", rawValue: "36,16" } }
      }
    ]
  } as never,
  {
    documentId: "contract-ved",
    requestedFields: ["goodsLines[].lineTotal", "goodsLines[].quantity", "goodsLines[].unitPrice"]
  } as never,
  [{ pageNumber: 1, imageBase64: "", mimeType: "image/png" }] as never
);
assert.deepEqual(
  adaptedVed.fields.find((field) => field.field === "goodsLines[].lineTotal")?.value,
  [36.16]
);
const adaptedScaleRepair = adaptNaturalInvoiceResponse(
  {
    goodsLines: [
      { description: "Scale", quantity: 4, unitPrice: 106.8, lineTotal: 427200, unit: "ADET" }
    ]
  } as never,
  {
    documentId: "contract-scale-repair",
    requestedFields: ["goodsLines[].lineTotal"]
  } as never,
  [{ pageNumber: 1, imageBase64: "", mimeType: "image/png" }] as never
);
assert.deepEqual(
  adaptedScaleRepair.fields.find((field) => field.field === "goodsLines[].lineTotal")?.value,
  [427.2]
);
const adaptedVedWrongEvidence = adaptNaturalInvoiceResponse(
  {
    goodsLines: [
      {
        description: "Breaker",
        quantity: 2,
        unitPrice: 18.08,
        lineTotal: 18080,
        unit: "ADET",
        evidence: { lineTotal: { header: "Amount", rawValue: "18.080" } }
      }
    ]
  } as never,
  {
    documentId: "contract-ved-wrong-evidence",
    requestedFields: ["goodsLines[].lineTotal", "goodsLines[].quantity", "goodsLines[].unitPrice"]
  } as never,
  [{ pageNumber: 1, imageBase64: "", mimeType: "image/png" }] as never
);
// Fail-closed: broken amount candidate is omitted rather than published as qty×price.
assert.equal(
  adaptedVedWrongEvidence.fields.find((field) => field.field === "goodsLines[].lineTotal"),
  undefined
);

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

function goodsScaleCandidate(field: string, value: number) {
  return {
    candidateId: field,
    field,
    value,
    confidence: 0.9,
    extractor: "invoice",
    logicalDocumentId: "ld-scale",
    uploadedFileId: "file-scale",
    documentType: DocumentType.INVOICE,
    evidence: [{ segmentId: "seg-scale", pageNumber: 1, contentSource: "PAGE_IMAGE" as const }]
  };
}
function goodsScaleEnvelope(rows: Array<{ quantity: number; unitPrice: number; lineTotal: number }>): DeclarationFieldCandidateEnvelope {
  const fields: DeclarationFieldCandidateEnvelope["fields"] = {};
  rows.forEach((row, index) => {
    fields[`goodsLines.${index}.quantity`] = [goodsScaleCandidate(`goodsLines.${index}.quantity`, row.quantity)];
    fields[`goodsLines.${index}.unitPrice`] = [goodsScaleCandidate(`goodsLines.${index}.unitPrice`, row.unitPrice)];
    fields[`goodsLines.${index}.lineTotal`] = [goodsScaleCandidate(`goodsLines.${index}.lineTotal`, row.lineTotal)];
  });
  return { version: "1", companyId: "company-scale", declarationId: "declaration-scale", fields };
}
const scaleResolution = resolveDeclarationFields({
  candidates: goodsScaleEnvelope([
    { quantity: 4, unitPrice: 106.8, lineTotal: 427200 },
    { quantity: 36, unitPrice: 106.8, lineTotal: 28770 },
    { quantity: 25000, unitPrice: 0.7, lineTotal: 17500 },
    { quantity: 1250, unitPrice: 0.7, lineTotal: 17500 },
    { quantity: 10, unitPrice: 9.72, lineTotal: 90 }
  ])
});
assert.equal(scaleResolution.fields["goodsLines.0.lineTotal"]?.status, "RESOLVED");
assert.equal(scaleResolution.fields["goodsLines.0.lineTotal"]?.value, 427.2);
assert.equal(scaleResolution.fields["goodsLines.1.lineTotal"]?.status, "REVIEW_REQUIRED");
assert.equal(scaleResolution.fields["goodsLines.1.lineTotal"]?.reason, "LINE_TOTAL_SCALE_REVIEW");
assert.equal(scaleResolution.fields["goodsLines.1.lineTotal"]?.value, undefined);
assert.equal(scaleResolution.fields["goodsLines.1.lineTotal"]?.candidates.length, 1);
assert.ok(scaleResolution.reviewRequiredFields.includes("goodsLines.1.lineTotal"));
assert.equal(scaleResolution.fields["goodsLines.2.lineTotal"]?.value, 17500);
assert.equal(scaleResolution.fields["goodsLines.3.lineTotal"]?.value, 17500);
assert.equal(scaleResolution.fields["goodsLines.3.lineTotal"]?.status, "RESOLVED");
assert.equal(scaleResolution.fields["goodsLines.4.lineTotal"]?.value, 90);
assert.equal(scaleResolution.fields["goodsLines.4.lineTotal"]?.status, "RESOLVED");

function originCandidate(field: string, value: string) {
  return {
    candidateId: field,
    field,
    value,
    confidence: 0.9,
    extractor: "invoice",
    logicalDocumentId: "ld-origin",
    uploadedFileId: "file-origin",
    documentType: DocumentType.INVOICE,
    evidence: [{ segmentId: "seg-origin", pageNumber: 1, contentSource: "PAGE_IMAGE" as const }]
  };
}
const mixedOrigin = resolveDeclarationFields({
  candidates: {
    version: "1",
    companyId: "company-origin",
    declarationId: "declaration-origin",
    fields: {
      originCountry: [originCandidate("originCountry", "RO")],
      "goodsLines.0.origin": [originCandidate("goodsLines.0.origin", "CN")],
      "goodsLines.1.origin": [originCandidate("goodsLines.1.origin", "DE")]
    }
  }
});
assert.equal(mixedOrigin.fields.originCountry?.status, "REVIEW_REQUIRED");
assert.equal(mixedOrigin.fields.originCountry?.value, undefined);
assert.equal(mixedOrigin.fields.originCountry?.reason, "MIXED_LINE_ORIGINS");
assert.equal(mixedOrigin.fields["goodsLines.0.origin"]?.value, "CN");
assert.equal(mixedOrigin.fields["goodsLines.1.origin"]?.value, "DE");
const uniformOrigin = resolveDeclarationFields({
  candidates: {
    version: "1",
    companyId: "company-origin",
    declarationId: "declaration-origin",
    fields: {
      originCountry: [originCandidate("originCountry", "TR")],
      "goodsLines.0.origin": [originCandidate("goodsLines.0.origin", "TR")],
      "goodsLines.1.origin": [originCandidate("goodsLines.1.origin", "TR")]
    }
  }
});
assert.equal(uniformOrigin.fields.originCountry?.status, "RESOLVED");
assert.equal(uniformOrigin.fields.originCountry?.value, "TR");

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
  lineTotalEvidenceLocaleRecovery: true,
  lineTotalCleanScaleRepair: true,
  nonScaleLineTotalLeftForReview: true,
  wrongAmountEvidenceFailClosed: true,
  yemLineTotalNotInventedFromPackagingQty: true,
  focZeroLineTotalPreserved: true,
  modestDiscountTotalPreserved: true,
  unitMojibakeRepair: true,
  fusedDocumentScopedOriginOverride: true,
  corpusSpecificRules: false
});
