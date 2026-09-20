import type { GoodsLine, NormalizedDeclaration } from "../normalization/normalizedDeclaration.types.js";
import type {
  ExportContractIssue,
  ExportDeclarationContract,
  ExportDeclarationSupplements,
  ExportLineSupplement,
  ExportValueSource
} from "./exportDeclarationContract.types.js";

function missing(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

function issue(path: string, source: ExportValueSource): ExportContractIssue {
  return {
    code: "MISSING_REQUIRED_FIELD",
    path,
    source,
    message: `Export için zorunlu alan eksik: ${path}`
  };
}

function requireValue(issues: ExportContractIssue[], path: string, value: unknown, source: ExportValueSource): void {
  if (missing(value)) issues.push(issue(path, source));
}

function lineSupplementFor(
  supplements: ExportDeclarationSupplements,
  line: GoodsLine,
): ExportLineSupplement {
  const byLine = supplements.lines?.[`line:${line.lineNo}`];
  const byProduct = line.productCode ? supplements.lines?.[`product:${line.productCode}`] : undefined;
  const byHs = line.hsCode ? supplements.lines?.[`hs:${line.hsCode}`] : undefined;
  return { ...byHs, ...byProduct, ...byLine };
}

/**
 * Foundation 5.5B boundary.
 *
 * This builder is deliberately format-neutral. It does not know Evrim Excel
 * column names, XML tags, or code translations (for example Bin -> BI).
 * Those belong to output adapters. It also never invents customs/master-data
 * values that are absent from NormalizedDeclaration or explicit supplements.
 */
export function buildExportDeclarationContract(
  normalized: NormalizedDeclaration,
  supplements: ExportDeclarationSupplements = {},
): ExportDeclarationContract {
  const issues: ExportContractIssue[] = [];

  requireValue(issues, "package.totalPackage", normalized.packageInfo.totalPackage, "NORMALIZED_DECLARATION");
  requireValue(issues, "package.packageType", normalized.packageInfo.packageType, "NORMALIZED_DECLARATION");
  requireValue(issues, "package.grossKg", normalized.packageInfo.grossKg, "NORMALIZED_DECLARATION");
  requireValue(issues, "package.netKg", normalized.packageInfo.netKg, "NORMALIZED_DECLARATION");

  if (!normalized.goodsLines.length) {
    issues.push(issue("lines", "NORMALIZED_DECLARATION"));
  }

  const lines = normalized.goodsLines.map((line, index) => {
    const lineNo = line.lineNo || index + 1;
    const prefix = `lines.${index}`;

    requireValue(issues, `${prefix}.hsCode`, line.hsCode, "NORMALIZED_DECLARATION");
    requireValue(issues, `${prefix}.productCode`, line.productCode, "NORMALIZED_DECLARATION");
    requireValue(issues, `${prefix}.description`, line.description, "NORMALIZED_DECLARATION");
    requireValue(issues, `${prefix}.quantity`, line.quantity, "NORMALIZED_DECLARATION");
    requireValue(issues, `${prefix}.unit`, line.unit, "NORMALIZED_DECLARATION");
    requireValue(issues, `${prefix}.unitPrice`, line.unitPrice, "NORMALIZED_DECLARATION");
    requireValue(issues, `${prefix}.lineTotal`, line.lineTotal, "NORMALIZED_DECLARATION");

    const extra = lineSupplementFor(supplements, line);
    const effectiveOrigin = extra.origin ?? line.origin ?? normalized.trade.origin;
    requireValue(
      issues,
      `${prefix}.origin`,
      effectiveOrigin,
      extra.origin ? "HUMAN_INPUT" : "NORMALIZED_DECLARATION"
    );

    return {
      lineNo,
      hsCode: line.hsCode ?? "",
      productCode: line.productCode ?? "",
      description: line.description ?? "",
      quantity: line.quantity ?? 0,
      unit: line.unit ?? "",
      unitPrice: line.unitPrice ?? 0,
      lineTotal: line.lineTotal ?? 0,
      origin: effectiveOrigin,
      brand: extra.brand,
      exemptionCode: extra.exemptionCode,
      permitCode: extra.permitCode,
      utsNo: extra.utsNo,
      usedFlag: extra.usedFlag
    };
  });

  if (
    normalized.packageInfo.grossKg !== undefined &&
    normalized.packageInfo.netKg !== undefined &&
    normalized.packageInfo.netKg > normalized.packageInfo.grossKg
  ) {
    issues.push({
      code: "INVALID_VALUE",
      path: "package.netKg",
      source: "NORMALIZED_DECLARATION",
      message: "Net ağırlık brüt ağırlıktan büyük olamaz."
    });
  }

  return {
    version: "1",
    invoice: {
      invoiceNo: normalized.header.invoiceNo,
      invoiceDate: normalized.header.invoiceDate,
      currency: normalized.header.currency,
      totalAmount: normalized.header.totalAmount
    },
    parties: normalized.parties,
    trade: normalized.trade,
    transport: normalized.transport,
    package: {
      totalPackage: normalized.packageInfo.totalPackage ?? 0,
      packageType: normalized.packageInfo.packageType ?? "",
      grossKg: normalized.packageInfo.grossKg ?? 0,
      netKg: normalized.packageInfo.netKg ?? 0
    },
    customs: {
      declarationType: supplements.declarationType ?? normalized.evrimHeader?.declarationType,
      exportType: supplements.exportType ?? normalized.evrimHeader?.exportType,
      customsOffice: supplements.customsOffice ?? normalized.evrimHeader?.customsOffice,
      regimeCode: supplements.regimeCode ?? normalized.evrimHeader?.regimeCode,
      fileReference: supplements.fileReference ?? normalized.evrimHeader?.fileReference,
      declarationDate: supplements.declarationDate ?? normalized.evrimHeader?.declarationDate
    },
    lines,
    readiness: {
      ready: issues.length === 0,
      issues
    }
  };
}

export function assertExportDeclarationReady(contract: ExportDeclarationContract): void {
  if (contract.readiness.ready) return;
  throw new Error(contract.readiness.issues.map((item) => item.message).join(" "));
}
