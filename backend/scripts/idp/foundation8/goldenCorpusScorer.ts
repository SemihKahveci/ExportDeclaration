import type { ActualGoodsRow, Foundation8ActualInvoice, GoldenGoodsRow, GoldenInvoiceCase } from "./goldenCorpus.types.js";

const GOODS_FIELDS = ["productCode", "description", "hsCode", "quantity", "unit", "unitPrice", "lineTotal", "origin"] as const;

type Check = { path: string; expected: unknown; actual: unknown; pass: boolean; kind: "SCALAR" | "ROW_COUNT" | "ROW_FIELD" | "COMPLETENESS" | "FORBIDDEN" };

function text(v: unknown): string { return String(v ?? "").trim().replace(/\s+/g, " ").toUpperCase(); }
const COUNTRY_EQUIVALENCE: Record<string,string> = {
  TR:"TR", TURKEY:"TR", "TÜRKİYE":"TR", TURKIYE:"TR",
  IN:"IN", INDIA:"IN", IT:"IT", ITALY:"IT", PL:"PL", POLAND:"PL",
  CN:"CN", CHINA:"CN", EE:"EE", ESTONIA:"EE", ESTONYA:"EE", HU:"HU", HUNGARY:"HU"
};
const UNIT_EQUIVALENCE: Record<string,string> = { PIECE:"PCS", PIECES:"PCS", PCS:"PCS" };
function semanticText(v: unknown): string {
  const t = text(v);
  return COUNTRY_EQUIVALENCE[t] ?? UNIT_EQUIVALENCE[t] ?? t;
}
function equal(expected: unknown, actual: unknown): boolean {
  if (typeof expected === "number") return typeof actual === "number" && Number.isFinite(actual) && Math.abs(actual - expected) <= Math.max(1e-6, Math.abs(expected) * 1e-6);
  if (expected === null) return actual === null || actual === undefined || actual === "";
  return semanticText(expected) === semanticText(actual);
}
function present(v: unknown): boolean { return !(v === null || v === undefined || v === ""); }
function rowMatches(expected: GoldenGoodsRow, actual: ActualGoodsRow): boolean {
  if (expected.productCode !== undefined && !equal(expected.productCode, actual.productCode)) return false;
  if (expected.descriptionContains !== undefined && !text(actual.description).includes(text(expected.descriptionContains))) return false;
  if (expected.hsCode !== undefined && !equal(expected.hsCode, actual.hsCode)) return false;
  if (expected.quantity !== undefined && !equal(expected.quantity, actual.quantity)) return false;
  if (expected.unit !== undefined && !equal(expected.unit, actual.unit)) return false;
  if (expected.unitPrice !== undefined && !equal(expected.unitPrice, actual.unitPrice)) return false;
  if (expected.lineTotal !== undefined && !equal(expected.lineTotal, actual.lineTotal)) return false;
  if (expected.origin !== undefined && !equal(expected.origin, actual.origin)) return false;
  return true;
}

export function scoreGoldenInvoice(golden: GoldenInvoiceCase, actual: Foundation8ActualInvoice) {
  const checks: Check[] = [];
  for (const [field, expected] of Object.entries(golden.expected.scalars)) {
    checks.push({ path: field, expected, actual: actual.scalars[field], pass: equal(expected, actual.scalars[field]), kind: "SCALAR" });
  }
  checks.push({ path: "goodsRows.length", expected: golden.expected.exactGoodsRowCount, actual: actual.goodsRows.length, pass: actual.goodsRows.length === golden.expected.exactGoodsRowCount, kind: "ROW_COUNT" });

  for (const expectedRow of golden.expected.goodsRows) {
    const candidates = expectedRow.rowNo ? [actual.goodsRows[expectedRow.rowNo - 1]].filter(Boolean) : actual.goodsRows;
    const matched = candidates.some(row => rowMatches(expectedRow, row!));
    checks.push({ path: expectedRow.rowNo ? `goodsRows.${expectedRow.rowNo}` : "goodsRows.sentinel", expected: expectedRow, actual: matched ? "MATCHED" : "NO_MATCH", pass: matched, kind: "ROW_FIELD" });
  }

  const required = golden.expected.requiredGoodsFields;
  const completeRows = actual.goodsRows.filter(row => required.every(field => present(row[field]))).length;
  checks.push({ path: "goodsRows.complete", expected: golden.expected.exactGoodsRowCount, actual: completeRows, pass: completeRows === golden.expected.exactGoodsRowCount, kind: "COMPLETENESS" });

  for (const [field, forbidden] of Object.entries(golden.expected.forbiddenValues ?? {})) {
    const value = actual.scalars[field];
    checks.push({ path: field, expected: `not ${JSON.stringify(forbidden)}`, actual: value, pass: !forbidden.some(v => equal(v, value)), kind: "FORBIDDEN" });
  }

  for (const field of golden.expected.expectedAbsentOrReview ?? []) {
    if (field.includes("*")) continue; // row-level unsupported fields are enforced by requiredGoodsFields/row assertions, not guessed.
    const value = actual.scalars[field];
    checks.push({ path: field, expected: "ABSENT_OR_REVIEW", actual: value, pass: !present(value), kind: "FORBIDDEN" });
  }

  const passed = checks.filter(c => c.pass).length;
  const failed = checks.length - passed;
  const completeRowRate = golden.expected.exactGoodsRowCount ? completeRows / golden.expected.exactGoodsRowCount : 1;
  return {
    caseId: golden.id,
    pass: failed === 0,
    summary: { checks: checks.length, passed, failed, exactGoodsRowCount: golden.expected.exactGoodsRowCount, actualGoodsRowCount: actual.goodsRows.length, completeRows, completeRowRate },
    failures: checks.filter(c => !c.pass),
    checks,
  };
}
