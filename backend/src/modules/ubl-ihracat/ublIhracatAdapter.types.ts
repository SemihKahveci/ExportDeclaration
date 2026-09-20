import type { ExportContractIssue, ExportDeclarationContract } from "../export-contract/exportDeclarationContract.types.js";

export interface UblIhracatAdapterOptions {
  /** UUID belongs to the invoice/e-invoice lifecycle; the adapter never copies one from another invoice. */
  uuid: string;
  invoiceTypeCode?: string;
  issueTime?: string;
  transportModeCode?: string;
}

export type UblIhracatIssue = ExportContractIssue | {
  code: "UBL_MISSING_REQUIRED_FIELD" | "UBL_UNSUPPORTED_CODE";
  path: string;
  message: string;
  source: "NORMALIZED_DECLARATION" | "HUMAN_INPUT";
};

export type UblIhracatResult =
  | { ready: false; issues: UblIhracatIssue[] }
  | { ready: true; xml: string; lineCount: number; profileId: "IHRACAT"; signed: false };

export interface UblIhracatCommercialInput {
  contract: ExportDeclarationContract;
  options: UblIhracatAdapterOptions;
}
