import type { DocumentTypeValue } from "../../common/enums/documentType.js";

/**
 * e-ihracat paketi: XML varsa çakışmada XML kazanır; yoksa PDF fatura.
 * Sonra ihracat faturası / çeki listesi / proforma sırası.
 */
export const sourcePriorityRules: Record<string, DocumentTypeValue[]> = {
  "header.invoiceNo": ["E_INVOICE_XML", "INVOICE"],
  "header.invoiceDate": ["E_INVOICE_XML", "INVOICE"],
  "header.currency": ["E_INVOICE_XML", "INVOICE", "EXPORT_INVOICE"],
  "header.totalAmount": ["E_INVOICE_XML", "INVOICE", "EXPORT_INVOICE"],

  "parties.seller": ["E_INVOICE_XML", "INVOICE", "EXPORT_INVOICE"],
  "parties.seller.name": ["E_INVOICE_XML", "INVOICE", "EXPORT_INVOICE"],
  "parties.seller.taxNo": ["E_INVOICE_XML", "INVOICE", "EXPORT_INVOICE"],
  "parties.seller.address": ["E_INVOICE_XML", "INVOICE", "EXPORT_INVOICE"],
  "parties.seller.country": ["E_INVOICE_XML", "INVOICE", "EXPORT_INVOICE"],

  "parties.buyer": ["E_INVOICE_XML", "INVOICE", "EXPORT_INVOICE"],
  "parties.buyer.name": ["E_INVOICE_XML", "INVOICE", "EXPORT_INVOICE"],
  "parties.buyer.taxNo": ["E_INVOICE_XML", "INVOICE", "EXPORT_INVOICE"],
  "parties.buyer.address": ["E_INVOICE_XML", "INVOICE", "EXPORT_INVOICE"],
  "parties.buyer.country": ["E_INVOICE_XML", "INVOICE", "EXPORT_INVOICE"],

  "trade.deliveryTerm": ["E_INVOICE_XML", "INVOICE", "EXPORT_INVOICE", "PROFORMA"],
  "transport.mode": ["E_INVOICE_XML", "INVOICE", "EXPORT_INVOICE", "BILL_OF_LADING_INSTRUCTION"],

  "packageInfo.totalPackage": ["E_INVOICE_XML", "INVOICE", "EXPORT_INVOICE", "PACKING_LIST"],
  "packageInfo.packageType": ["E_INVOICE_XML", "INVOICE", "EXPORT_INVOICE", "PACKING_LIST"],
  "packageInfo.grossKg": ["E_INVOICE_XML", "INVOICE", "EXPORT_INVOICE", "PACKING_LIST"],
  "packageInfo.netKg": ["E_INVOICE_XML", "INVOICE", "EXPORT_INVOICE", "PACKING_LIST"]
};

/** Kalem satırları: e-fatura XML > PDF fatura > EXPORT_INVOICE. */
export const goodsLineSourcePriority: DocumentTypeValue[] = [
  "E_INVOICE_XML",
  "INVOICE",
  "EXPORT_INVOICE",
  "PROFORMA"
];
