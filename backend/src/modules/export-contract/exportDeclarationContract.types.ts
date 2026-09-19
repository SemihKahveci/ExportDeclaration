import type { NormalizedDeclaration } from "../normalization/normalizedDeclaration.types.js";

export type ExportValueSource = "NORMALIZED_DECLARATION" | "MASTER_DATA" | "HUMAN_INPUT";

export interface ExportContractIssue {
  code: "MISSING_REQUIRED_FIELD" | "INVALID_VALUE";
  path: string;
  message: string;
  source: ExportValueSource;
}

export interface ExportLineSupplement {
  origin?: string;
  brand?: string;
  exemptionCode?: string;
  permitCode?: string;
  utsNo?: string;
  usedFlag?: string;
}

export interface ExportDeclarationSupplements {
  declarationType?: string;
  exportType?: string;
  customsOffice?: string;
  regimeCode?: string;
  fileReference?: string;
  declarationDate?: string;
  lines?: Record<string, ExportLineSupplement>;
}

export interface ExportDeclarationLine {
  lineNo: number;
  hsCode: string;
  productCode: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  origin?: string;
  brand?: string;
  exemptionCode?: string;
  permitCode?: string;
  utsNo?: string;
  usedFlag?: string;
}

export interface ExportDeclarationContract {
  version: "1";
  invoice: {
    invoiceNo?: string;
    invoiceDate?: string;
    currency?: string;
    totalAmount?: number;
  };
  parties: NormalizedDeclaration["parties"];
  trade: NormalizedDeclaration["trade"];
  transport: NormalizedDeclaration["transport"];
  package: {
    totalPackage: number;
    packageType: string;
    grossKg: number;
    netKg: number;
  };
  customs: {
    declarationType?: string;
    exportType?: string;
    customsOffice?: string;
    regimeCode?: string;
    fileReference?: string;
    declarationDate?: string;
  };
  lines: ExportDeclarationLine[];
  readiness: {
    ready: boolean;
    issues: ExportContractIssue[];
  };
}
