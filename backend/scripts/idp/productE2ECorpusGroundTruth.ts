export type ProductE2EGroundTruthCase = {
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

export const PRODUCT_E2E_CORPUS_ROOT = "/app/uploads/product-e2e";

export const PRODUCT_E2E_CORPUS_CASES: ProductE2EGroundTruthCase[] = [
  { id:"clk-celikel", pdf:"CLK2026000001021.pdf", expected:{ invoiceNumber:"CLK2026000001021", currency:"EUR", deliveryTerm:"EXW", firstGoodsLine:{ descriptionContains:"INVERTER HOUSING", hsCode:"761699909019", quantity:1600, unit:"ADET", unitPrice:24.9378, lineTotal:39900.48 } } },
  { id:"textilium", pdf:"792CD3D2-CAAE-4E7B-978F-C1FE94E50709.pdf", expected:{ invoiceNumber:"TXT2026000000091", currency:"EUR", deliveryTerm:"CIP", firstGoodsLine:{ descriptionContains:"ERKEK", hsCode:"610510000000", quantity:569, unit:"ADET", unitPrice:14.8, lineTotal:8421.2 } } },
  { id:"makro-boya", pdf:"IHR2026000000035_FAISAL SOUDİ~21770191.pdf", expected:{ invoiceNumber:"IHR2026000000035", currency:"USD", deliveryTerm:"EXW", firstGoodsLine:{ descriptionContains:"TYLOSE 100000", hsCode:"391239850000", quantity:1575, unit:"KG", unitPrice:7.75, lineTotal:12206.25 } } },
  { id:"fiber-beton", pdf:"AAA2026000000009.pdf", expected:{ invoiceNumber:"AAA2026000000009", currency:"USD", deliveryTerm:"DAP", firstGoodsLine:{ descriptionContains:"MACRO SYNTHETIC FIBER REINFORCEMENT", hsCode:"550340000011", quantity:2250, unit:"KG", unitPrice:4.1, lineTotal:9225 } } },
];
