export const InvoiceUnderstandingDecision = {
  UNDERSTOOD: "UNDERSTOOD",
  PARTIAL: "PARTIAL",
  REVIEW_REQUIRED: "REVIEW_REQUIRED"
} as const;
export type InvoiceUnderstandingDecisionValue = (typeof InvoiceUnderstandingDecision)[keyof typeof InvoiceUnderstandingDecision];
export type InvoiceUnderstandingEvidenceSource = "NATIVE_TEXT" | "OCR" | "PAGE_IMAGE" | "MODEL" | "VERIFIED_KNOWLEDGE";
export interface InvoiceUnderstandingEvidenceRef { pageNumber: number; source: InvoiceUnderstandingEvidenceSource; quote?: string; region?: { x: number; y: number; width: number; height: number }; }
export interface GroundedValue<T> { value: T; confidence: number; evidence: InvoiceUnderstandingEvidenceRef[]; }
export interface InvoiceUnderstandingParty { name?: GroundedValue<string>; taxNo?: GroundedValue<string>; address?: GroundedValue<string>; country?: GroundedValue<string>; }
export interface InvoiceUnderstandingDocumentIdentity { invoiceNo?: GroundedValue<string>; invoiceDate?: GroundedValue<string>; }
export interface InvoiceUnderstandingCommercialTerms { currency?: GroundedValue<string>; totalAmount?: GroundedValue<number>; exchangeRate?: GroundedValue<number>; paymentTerm?: GroundedValue<string>; bankDetails?: GroundedValue<string>; }
export interface InvoiceUnderstandingLogistics { deliveryTerm?: GroundedValue<string>; transportMode?: GroundedValue<string>; grossWeight?: GroundedValue<number>; netWeight?: GroundedValue<number>; }
export interface InvoiceUnderstandingPackageSummary { count?: GroundedValue<number>; type?: GroundedValue<string>; }
export interface InvoiceUnderstandingGoodsRow {
  /** Stable identity inside this semantic artifact; never inferred from field index alone. */
  rowId: string;
  /** Evidence that this commercial row itself exists. Field evidence is not a substitute for row evidence. */
  rowEvidence: InvoiceUnderstandingEvidenceRef[];
  pageNumbers: number[];
  productCode?: GroundedValue<string>; description?: GroundedValue<string>; hsCode?: GroundedValue<string>;
  quantity?: GroundedValue<number>; unit?: GroundedValue<string>; unitPrice?: GroundedValue<number>;
  lineTotal?: GroundedValue<number>; origin?: GroundedValue<string>;
}
export interface InvoiceUnderstandingGoodsTable {
  tableEvidence: InvoiceUnderstandingEvidenceRef[];
  /** Optional; must never be manufactured from a count of HS/GTIP tokens. */
  expectedRowCount?: number;
  rows: InvoiceUnderstandingGoodsRow[];
}
export interface InvoiceUnderstandingIssue { code: string; message: string; scope?: "DOCUMENT" | "PARTY" | "COMMERCIAL" | "LOGISTICS" | "GOODS_TABLE" | "GOODS_ROW"; rowId?: string; }
export interface InvoiceUnderstanding {
  version: "1"; documentId: string; decision: InvoiceUnderstandingDecisionValue;
  documentIdentity: InvoiceUnderstandingDocumentIdentity;
  parties: { seller?: InvoiceUnderstandingParty; buyer?: InvoiceUnderstandingParty };
  commercialTerms: InvoiceUnderstandingCommercialTerms; logistics: InvoiceUnderstandingLogistics;
  packageSummary: InvoiceUnderstandingPackageSummary; goodsTable: InvoiceUnderstandingGoodsTable;
  issues: InvoiceUnderstandingIssue[];
}
export const INVOICE_GOODS_SEMANTIC_FIELDS = ["productCode", "description", "hsCode", "quantity", "unit", "unitPrice", "lineTotal", "origin"] as const;
export type InvoiceGoodsSemanticField = (typeof INVOICE_GOODS_SEMANTIC_FIELDS)[number];
