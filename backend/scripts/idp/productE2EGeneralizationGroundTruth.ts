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
  /**
   * SHA-256 of the exact PDF bytes used when ground truth was frozen.
   * This prevents silently replacing a holdout PDF after seeing pipeline output.
   */
  sourceSha256: string;
  /** ISO calendar date (YYYY-MM-DD) when a human froze the expected values. */
  groundTruthFrozenOn: string;
  expected: GeneralizationExpectedFields;
  /** Fields intentionally expected to remain fail-closed for human review. */
  expectedReviewFields: string[];
};

export const PRODUCT_E2E_GENERALIZATION_CORPUS_ROOT = "/app/uploads/product-e2e-generalization";

/**
 * HOLDOUT CONTRACT
 *
 * Add a case here only after a human has inspected the source invoice and frozen
 * its expected values BEFORE the production IDP pipeline is executed for that
 * case. Never derive or edit expected values from pipeline output.
 *
 * The bootstrap checkpoint intentionally starts empty. The contract verifier
 * validates the schema without requiring customer PDFs or invoking IDP/Qwen.
 */
export const PRODUCT_E2E_GENERALIZATION_CASES: ProductE2EGeneralizationCase[] = [];
