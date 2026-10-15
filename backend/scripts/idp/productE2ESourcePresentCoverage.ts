export type SourcePresentCoverageFamily =
  | "IDENTITY"
  | "TRADE"
  | "COUNTRY"
  | "PACKAGE"
  | "GOODS"
  | "OTHER";

export type SourcePresentCoverageCheck = {
  field: string;
  passed: boolean;
  status?: string;
  expected?: unknown;
  actual?: unknown;
};

export type SourcePresentCoverageFamilyResult = {
  family: SourcePresentCoverageFamily;
  passed: number;
  total: number;
  percent: number;
  failedFields: string[];
};

/**
 * Family classification is semantic, not invoice/vendor specific.  The gate only
 * measures fields that are already frozen as source-present ground truth.  A field
 * absent from the source is never manufactured merely to increase coverage.
 */
export function sourcePresentFamily(field: string): SourcePresentCoverageFamily {
  if (field === "invoiceNumber" || field === "invoiceDate" || field === "currency") return "IDENTITY";
  if (field === "deliveryTerm") return "TRADE";
  if (field === "originCountry") return "COUNTRY";
  if (field === "grossWeight" || field === "netWeight") return "PACKAGE";
  if (field === "goodsLines.length" || field.startsWith("goodsLines[")) return "GOODS";
  return "OTHER";
}

export function summarizeSourcePresentCoverage(
  checks: SourcePresentCoverageCheck[],
): SourcePresentCoverageFamilyResult[] {
  const families = new Map<SourcePresentCoverageFamily, SourcePresentCoverageCheck[]>();
  for (const check of checks) {
    const family = sourcePresentFamily(check.field);
    const current = families.get(family) ?? [];
    current.push(check);
    families.set(family, current);
  }
  return [...families.entries()].map(([family, familyChecks]) => {
    const passed = familyChecks.filter((check) => check.passed).length;
    return {
      family,
      passed,
      total: familyChecks.length,
      percent: familyChecks.length ? Number((100 * passed / familyChecks.length).toFixed(1)) : 100,
      failedFields: familyChecks.filter((check) => !check.passed).map((check) => check.field),
    };
  });
}

export function aggregateSourcePresentCoverage(
  caseResults: Array<{ sourcePresentCoverage: SourcePresentCoverageFamilyResult[] }>,
) {
  const totals = new Map<SourcePresentCoverageFamily, { passed: number; total: number; failedFields: string[] }>();
  for (const result of caseResults) {
    for (const family of result.sourcePresentCoverage) {
      const current = totals.get(family.family) ?? { passed: 0, total: 0, failedFields: [] };
      current.passed += family.passed;
      current.total += family.total;
      current.failedFields.push(...family.failedFields);
      totals.set(family.family, current);
    }
  }
  return [...totals.entries()].map(([family, value]) => ({
    family,
    passed: value.passed,
    total: value.total,
    percent: value.total ? Number((100 * value.passed / value.total).toFixed(1)) : 100,
    failedFields: value.failedFields,
  }));
}
