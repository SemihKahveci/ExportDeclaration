import { INVOICE_GOODS_SEMANTIC_FIELDS, type GroundedValue, type InvoiceGoodsSemanticField, type InvoiceUnderstanding, type InvoiceUnderstandingEvidenceRef, type InvoiceUnderstandingGoodsRow } from "./invoiceUnderstanding.types.js";

export type InvoiceGoodsRowCompleteness = { rowId: string; presentFields: InvoiceGoodsSemanticField[]; missingRequiredFields: InvoiceGoodsSemanticField[]; complete: boolean };
export type InvoiceUnderstandingValidation = { valid: boolean; errors: string[]; goodsRows: InvoiceGoodsRowCompleteness[]; completeGoodsRowCount: number; materializedGoodsRowCount: number; expectedGoodsRowCount?: number; goodsTableComplete: boolean };

function validateEvidence(evidence: InvoiceUnderstandingEvidenceRef[], label: string, errors: string[]): void {
  if (!Array.isArray(evidence) || evidence.length === 0) { errors.push(`${label}: evidence is required`); return; }
  for (const ref of evidence) if (!Number.isInteger(ref.pageNumber) || ref.pageNumber < 1) errors.push(`${label}: invalid evidence pageNumber`);
}
function validateGroundedValue<T>(field: GroundedValue<T> | undefined, label: string, errors: string[]): void {
  if (!field) return;
  if (!Number.isFinite(field.confidence) || field.confidence < 0 || field.confidence > 1) errors.push(`${label}: confidence must be between 0 and 1`);
  validateEvidence(field.evidence, label, errors);
}
function rowCompleteness(row: InvoiceUnderstandingGoodsRow, requiredFields: readonly InvoiceGoodsSemanticField[]): InvoiceGoodsRowCompleteness {
  const presentFields = INVOICE_GOODS_SEMANTIC_FIELDS.filter(field => row[field] !== undefined);
  const present = new Set(presentFields);
  const missingRequiredFields = requiredFields.filter(field => !present.has(field));
  return { rowId: row.rowId, presentFields, missingRequiredFields, complete: missingRequiredFields.length === 0 };
}
export function validateInvoiceUnderstanding(understanding: InvoiceUnderstanding, options: { requiredGoodsFields?: readonly InvoiceGoodsSemanticField[] } = {}): InvoiceUnderstandingValidation {
  const errors: string[] = [];
  const requiredGoodsFields = options.requiredGoodsFields ?? ["description", "quantity", "unit", "lineTotal"];
  if (understanding.version !== "1") errors.push("unsupported InvoiceUnderstanding version");
  if (!understanding.documentId.trim()) errors.push("documentId is required");
  const rowIds = new Set<string>();
  for (const row of understanding.goodsTable.rows) {
    if (!row.rowId.trim()) errors.push("goods rowId is required");
    if (rowIds.has(row.rowId)) errors.push(`duplicate goods rowId: ${row.rowId}`);
    rowIds.add(row.rowId);
    validateEvidence(row.rowEvidence, `goods row ${row.rowId}`, errors);
    if (!Array.isArray(row.pageNumbers) || row.pageNumbers.length === 0) errors.push(`goods row ${row.rowId}: pageNumbers are required`);
    for (const field of INVOICE_GOODS_SEMANTIC_FIELDS) validateGroundedValue(row[field] as GroundedValue<unknown> | undefined, `goods row ${row.rowId}.${field}`, errors);
    const rowPages = new Set(row.rowEvidence.map(ref => ref.pageNumber));
    for (const field of INVOICE_GOODS_SEMANTIC_FIELDS) {
      const grounded = row[field] as GroundedValue<unknown> | undefined;
      if (grounded && !grounded.evidence.some(ref => rowPages.has(ref.pageNumber))) errors.push(`goods row ${row.rowId}.${field}: evidence is not row-local`);
    }
  }
  validateEvidence(understanding.goodsTable.tableEvidence, "goods table", errors);
  const goodsRows = understanding.goodsTable.rows.map(row => rowCompleteness(row, requiredGoodsFields));
  const completeGoodsRowCount = goodsRows.filter(row => row.complete).length;
  const materializedGoodsRowCount = goodsRows.length;
  const expectedGoodsRowCount = understanding.goodsTable.expectedRowCount;
  if (expectedGoodsRowCount !== undefined && (!Number.isInteger(expectedGoodsRowCount) || expectedGoodsRowCount < 0)) errors.push("goodsTable.expectedRowCount must be a non-negative integer");
  const countMatches = expectedGoodsRowCount === undefined || expectedGoodsRowCount === materializedGoodsRowCount;
  const goodsTableComplete = countMatches && completeGoodsRowCount === materializedGoodsRowCount && (expectedGoodsRowCount === undefined || completeGoodsRowCount === expectedGoodsRowCount);
  return { valid: errors.length === 0, errors, goodsRows, completeGoodsRowCount, materializedGoodsRowCount, expectedGoodsRowCount, goodsTableComplete };
}
/** Arithmetic corroborates extraction; it never manufactures a missing value. */
export function checkGoodsRowArithmetic(row: InvoiceUnderstandingGoodsRow, tolerance = 0.01): { checkable: boolean; consistent?: boolean; delta?: number } {
  const quantity = row.quantity?.value, unitPrice = row.unitPrice?.value, lineTotal = row.lineTotal?.value;
  if (typeof quantity !== "number" || typeof unitPrice !== "number" || typeof lineTotal !== "number") return { checkable: false };
  const delta = Math.abs(quantity * unitPrice - lineTotal);
  return { checkable: true, consistent: delta <= tolerance, delta };
}
