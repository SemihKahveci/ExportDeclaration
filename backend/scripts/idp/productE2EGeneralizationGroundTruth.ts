export type GeneralizationDocumentMode = "DIGITAL" | "SCANNED" | "MIXED";

export type GeneralizationExpectedGoodsLine = {
  descriptionContains: string;
  hsCode?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  lineTotal?: number;
};

export type GeneralizationExpectedFields = {
  invoiceNumber?: string;
  currency?: string;
  deliveryTerm?: string;
  invoiceDate?: string;
  grossWeight?: number;
  netWeight?: number;
  originCountry?: string;
  goodsLines: GeneralizationExpectedGoodsLine[];
};

export type ProductE2EGeneralizationCase = {
  id: string;
  pdf: string;
  mode: GeneralizationDocumentMode;
  sourceSha256: string;
  groundTruthFrozenOn: string;
  expected: GeneralizationExpectedFields;
  /** Fields intentionally expected to remain fail-closed for human review. */
  expectedReviewFields: string[];
};

export const PRODUCT_E2E_GENERALIZATION_CORPUS_ROOT = "/app/uploads/product-e2e-generalization";

/**
 * FROZEN HOLDOUT CONTRACT
 *
 * These values were transcribed from the source invoices before any production
 * IDP execution for these cases. Do not edit them in response to pipeline output.
 * `goodsLines` are preselected assertions; for very large/scanned documents they
 * are intentionally sentinel rows, not a claim that every source row is listed.
 */
export const PRODUCT_E2E_GENERALIZATION_CASES: ProductE2EGeneralizationCase[] = [
  {
    id: "volta-vxa-0035",
    pdf: "VXA2026000000035.pdf",
    mode: "DIGITAL",
    sourceSha256: "38ccdae88231df83a828809c4d9c1dcceea70b4c796e7f2fe8c2f4d09619edf7",
    groundTruthFrozenOn: "2026-10-01",
    expected: {
      invoiceNumber: "VXA2026000000035",
      currency: "EUR",
      deliveryTerm: "EXW",
      invoiceDate: "2026-09-23",
      grossWeight: 87,
      netWeight: 83,
      originCountry: "TR",
      goodsLines: [{
        descriptionContains: "PS4 GASOLINE SCOOTER (50CC) BLUE",
        hsCode: "871110000011",
        quantity: 1,
        unit: "Adet",
        unitPrice: 560,
        lineTotal: 560,
      }],
    },
    expectedReviewFields: [],
  },
  {
    id: "eryem-yem-0037",
    pdf: "yem_5646309988.xml.pdf",
    mode: "DIGITAL",
    sourceSha256: "c281bbb9ee1a61928ad6502ba646cbb3fdc16c6cbc17a1b1822974e34fac2a87",
    groundTruthFrozenOn: "2026-10-01",
    expected: {
      invoiceNumber: "YEM2026000000037",
      currency: "USD",
      deliveryTerm: "EXW",
      invoiceDate: "2026-09-23",
      grossWeight: 26020,
      originCountry: "TR",
      goodsLines: [{
        descriptionContains: "Tavuk İşlenmiş Ayak A Kalite",
        hsCode: "020714990012",
        quantity: 25000,
        unit: "KG",
        unitPrice: 0.70,
        lineTotal: 17500,
      }],
    },
    expectedReviewFields: [],
  },
  {
    id: "pml-p0087",
    pdf: "INVOICE - P0087.pdf",
    mode: "DIGITAL",
    sourceSha256: "5b14c067d0a389aba63fee8690b23a47a10a700ea05ae4085694cdb9a391cd2d",
    groundTruthFrozenOn: "2026-10-01",
    expected: {
      invoiceNumber: "P0087/26-27",
      currency: "EUR",
      deliveryTerm: "DAP",
      invoiceDate: "2026-09-16",
      grossWeight: 24,
      netWeight: 20.190,
      originCountry: "IN",
      goodsLines: [{
        descriptionContains: "VSeA Base Minus Plug",
        quantity: 5000,
        unit: "Pieces",
        unitPrice: 0.0563,
        lineTotal: 281.50,
      }],
    },
    expectedReviewFields: ["goodsLines.hsCode"],
  },
  {
    id: "dermeternal-2026-0001",
    pdf: "Rechnung-Dermeternal GmbH.pdf",
    mode: "DIGITAL",
    sourceSha256: "c5583d0c71dded8ae6130dc6a270b625a968f09ee9199dcca16b77b0285d6b54",
    groundTruthFrozenOn: "2026-10-01",
    expected: {
      invoiceNumber: "2026/0001",
      currency: "EUR",
      invoiceDate: "2026-08-14",
      originCountry: "IT",
      goodsLines: [
        { descriptionContains: "FORMULA 1 - FACE - ETERNAL E'CLAIR", quantity: 2000, unit: "pcs", unitPrice: 5.25, lineTotal: 10500 },
        { descriptionContains: "FORMULA 2 - NECK & DÉCOLLETÉ - ETERNAL NADIN", quantity: 2000, unit: "pcs", unitPrice: 5.25, lineTotal: 10500 },
        { descriptionContains: "FORMULA 1 - FACE - ETERNAL E'CLAIR - FOC", quantity: 200, unit: "pcs", unitPrice: 5.25, lineTotal: 0 },
        { descriptionContains: "FORMULA 2 - NECK & DÉCOLLETÉ - ETERNAL NADIN - FOC", quantity: 200, unit: "pcs", unitPrice: 5.25, lineTotal: 0 },
      ],
    },
    expectedReviewFields: ["deliveryTerm", "goodsLines.hsCode"],
  },
  {
    id: "ningbo-wyl-2026060501",
    pdf: "WYL2026060501.pdf",
    mode: "DIGITAL",
    sourceSha256: "54aa7dcbc5f632938f20ba4c9e04ea098cb63689a2e0a6db488de3522ed4b27f",
    groundTruthFrozenOn: "2026-10-01",
    expected: {
      invoiceNumber: "WYL2026060501",
      currency: "USD",
      deliveryTerm: "FOB",
      invoiceDate: "2026-06-05",
      goodsLines: [
        { descriptionContains: "Metal tube 35mm", quantity: 500, unitPrice: 1.52, lineTotal: 760 },
        { descriptionContains: "Metal tube 38mm", quantity: 1250, unitPrice: 2.16, lineTotal: 2700 },
        { descriptionContains: "Metal tube 35mm", quantity: 500, unitPrice: 0.55, lineTotal: 275 },
        { descriptionContains: "squeegees", quantity: 1, unitPrice: 1100, lineTotal: 1100 },
      ],
    },
    expectedReviewFields: ["goodsLines.hsCode"],
  },
  {
    id: "mekar-ear-0068",
    pdf: "MEKAR ONAYLI FATURA.pdf",
    mode: "SCANNED",
    sourceSha256: "90cd7761e8ada68cf9486fbb33d216b1698e4a2c9328eca3f6572d513944b098",
    groundTruthFrozenOn: "2026-10-01",
    expected: {
      invoiceNumber: "EAR2026000000068",
      currency: "TRY",
      deliveryTerm: "EXW",
      invoiceDate: "2026-09-22",
      grossWeight: 48,
      netWeight: 40,
      originCountry: "US",
      goodsLines: [
        { descriptionContains: "IND Amph/Ecstasy 51ml", quantity: 3, unit: "Adet", unitPrice: 25249.0959, lineTotal: 75747.29 },
        { descriptionContains: "AB Pinaca Kit (28/14ml)", quantity: 12, unit: "Adet", unitPrice: 22443.6408, lineTotal: 269323.69 },
        { descriptionContains: "Drug Adulteration Test", quantity: 4, unit: "Kutu", unitPrice: 1683.2731, lineTotal: 6733.09 },
        { descriptionContains: "Indiko 20ml reagent bottle", quantity: 1, unit: "Kutu", unitPrice: 5610.9102, lineTotal: 5610.91 },
      ],
    },
    expectedReviewFields: ["goodsLines.hsCode"],
  },
];
