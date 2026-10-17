export type GoldenScalarValue = string | number | null;

export type GoldenGoodsRow = {
  rowNo?: number;
  productCode?: string;
  descriptionContains?: string;
  hsCode?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  lineTotal?: number;
  origin?: string;
};

export type GoldenInvoiceCase = {
  schemaVersion: "foundation8-golden-v1";
  id: string;
  pdf: string;
  sourceSha256: string;
  frozenOn: string;
  evidenceBasis: string[];
  expected: {
    scalars: Record<string, GoldenScalarValue>;
    exactGoodsRowCount: number;
    requiredGoodsFields: Array<"productCode" | "description" | "hsCode" | "quantity" | "unit" | "unitPrice" | "lineTotal" | "origin">;
    goodsRows: GoldenGoodsRow[];
    expectedAbsentOrReview?: string[];
    forbiddenValues?: Record<string, GoldenScalarValue[]>;
  };
};

export type ActualGoodsRow = {
  productCode?: unknown;
  description?: unknown;
  hsCode?: unknown;
  quantity?: unknown;
  unit?: unknown;
  unitPrice?: unknown;
  lineTotal?: unknown;
  origin?: unknown;
};

export type Foundation8ActualInvoice = {
  scalars: Record<string, unknown>;
  goodsRows: ActualGoodsRow[];
};
