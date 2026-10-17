import type {
  InvoiceUnderstandingCommercialTerms,
  InvoiceUnderstandingDocumentIdentity,
  InvoiceUnderstandingGoodsTable,
  InvoiceUnderstandingLogistics,
  InvoiceUnderstandingPackageSummary,
  InvoiceUnderstandingParty,
  InvoiceUnderstandingIssue
} from "./invoiceUnderstanding.types.js";
import type { InvoiceSpecialistDomain } from "./invoiceUnderstandingOrchestration.js";

export type PartySpecialistPayload = {
  parties: { seller?: InvoiceUnderstandingParty; buyer?: InvoiceUnderstandingParty };
};

export type CommercialSpecialistPayload = {
  documentIdentity: InvoiceUnderstandingDocumentIdentity;
  commercialTerms: InvoiceUnderstandingCommercialTerms;
};

export type GoodsSpecialistPayload = {
  goodsTable: InvoiceUnderstandingGoodsTable;
};

export type LogisticsSpecialistPayload = {
  logistics: InvoiceUnderstandingLogistics;
  packageSummary: InvoiceUnderstandingPackageSummary;
};

export type InvoiceSpecialistPayloadByDomain = {
  PARTIES: PartySpecialistPayload;
  COMMERCIAL: CommercialSpecialistPayload;
  GOODS: GoodsSpecialistPayload;
  LOGISTICS: LogisticsSpecialistPayload;
};

export type InvoiceSpecialistResult<D extends InvoiceSpecialistDomain = InvoiceSpecialistDomain> = {
  domain: D;
  status: "COMPLETE" | "PARTIAL" | "REVIEW_REQUIRED";
  payload: InvoiceSpecialistPayloadByDomain[D];
  issues: InvoiceUnderstandingIssue[];
};
