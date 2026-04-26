import type { DocumentTypeValue } from "../../common/enums/documentType.js";

/**
 * Teknik doküman §5: önce fatura (INVOICE / E_INVOICE_XML), sonra ihracat faturası (EXPORT_INVOICE),
 * kap/kilo ve teslim/ödeme için çeki listesi / proforma / konşimento talimatı sırası dokümandaki tabloyla uyumlu.
 */
export const sourcePriorityRules: Record<string, DocumentTypeValue[]> = {
  "header.invoiceNo": ["INVOICE", "E_INVOICE_XML"],
  "header.invoiceDate": ["INVOICE", "E_INVOICE_XML"],
  "header.currency": ["INVOICE", "E_INVOICE_XML", "EXPORT_INVOICE"],
  "header.totalAmount": ["INVOICE", "E_INVOICE_XML", "EXPORT_INVOICE"],

  "parties.seller": ["INVOICE", "E_INVOICE_XML", "EXPORT_INVOICE"],
  "parties.seller.name": ["INVOICE", "E_INVOICE_XML", "EXPORT_INVOICE"],
  "parties.seller.taxNo": ["INVOICE", "E_INVOICE_XML", "EXPORT_INVOICE"],
  "parties.seller.address": ["INVOICE", "E_INVOICE_XML", "EXPORT_INVOICE"],
  "parties.seller.country": ["INVOICE", "E_INVOICE_XML", "EXPORT_INVOICE"],

  "parties.buyer": ["INVOICE", "E_INVOICE_XML", "EXPORT_INVOICE"],
  "parties.buyer.name": ["INVOICE", "E_INVOICE_XML", "EXPORT_INVOICE"],
  "parties.buyer.address": ["INVOICE", "E_INVOICE_XML", "EXPORT_INVOICE"],
  "parties.buyer.country": ["INVOICE", "E_INVOICE_XML", "EXPORT_INVOICE"],

  "parties.notify": ["BILL_OF_LADING_INSTRUCTION", "EXPORT_INVOICE", "INVOICE", "E_INVOICE_XML"],
  "parties.notify.name": ["BILL_OF_LADING_INSTRUCTION", "EXPORT_INVOICE", "INVOICE", "E_INVOICE_XML"],
  "parties.notify.address": ["BILL_OF_LADING_INSTRUCTION", "EXPORT_INVOICE", "INVOICE", "E_INVOICE_XML"],

  "trade.deliveryTerm": ["INVOICE", "E_INVOICE_XML", "EXPORT_INVOICE", "PROFORMA"],
  "trade.paymentType": ["INVOICE", "E_INVOICE_XML", "EXPORT_INVOICE", "PROFORMA"],
  "trade.origin": ["INVOICE", "E_INVOICE_XML", "EXPORT_INVOICE"],

  "transport.mode": ["INVOICE", "E_INVOICE_XML", "EXPORT_INVOICE", "BILL_OF_LADING_INSTRUCTION"],
  "transport.carrier": ["BILL_OF_LADING_INSTRUCTION", "INVOICE", "E_INVOICE_XML", "EXPORT_INVOICE"],
  "transport.departureCustoms": ["INVOICE", "E_INVOICE_XML", "EXPORT_INVOICE", "BILL_OF_LADING_INSTRUCTION"],
  "transport.containerNo": ["BILL_OF_LADING_INSTRUCTION", "INVOICE", "E_INVOICE_XML", "EXPORT_INVOICE"],
  "transport.billOfLadingNo": ["BILL_OF_LADING_INSTRUCTION", "INVOICE", "E_INVOICE_XML"],

  "packageInfo.totalPackage": ["INVOICE", "E_INVOICE_XML", "EXPORT_INVOICE", "PACKING_LIST"],
  "packageInfo.packageType": ["INVOICE", "E_INVOICE_XML", "EXPORT_INVOICE", "PACKING_LIST"],
  "packageInfo.grossKg": ["INVOICE", "E_INVOICE_XML", "EXPORT_INVOICE", "PACKING_LIST"],
  "packageInfo.netKg": ["INVOICE", "E_INVOICE_XML", "EXPORT_INVOICE", "PACKING_LIST"]
};

/** Kalem satırları: doküman — önce fatura, sonra invoice (EXPORT_INVOICE). */
export const goodsLineSourcePriority: DocumentTypeValue[] = [
  "INVOICE",
  "E_INVOICE_XML",
  "EXPORT_INVOICE",
  "PROFORMA"
];
