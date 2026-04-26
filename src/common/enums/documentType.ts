/**
 * INVOICE: Ana fatura (PDF üzerinde seçilebilir metin veya ileride yapılandırılmış akış).
 * E_INVOICE_XML: UBL e-Fatura XML (IHRACAT profili vb.).
 * EXPORT_INVOICE: Dokümandaki "Invoice" / İngilizce ihracat faturası (xlsx) — destekleyici güçlü kaynak.
 */
export const DocumentType = {
  INVOICE: "INVOICE",
  E_INVOICE_XML: "E_INVOICE_XML",
  EXPORT_INVOICE: "EXPORT_INVOICE",
  PACKING_LIST: "PACKING_LIST",
  PROFORMA: "PROFORMA",
  BILL_OF_LADING_INSTRUCTION: "BILL_OF_LADING_INSTRUCTION",
  OTHER: "OTHER"
} as const;

export type DocumentTypeValue = (typeof DocumentType)[keyof typeof DocumentType];

/** Zorunlu "fatura" kabul edilen tipler (teknik doküman §6). */
export const mandatoryInvoiceTypes: DocumentTypeValue[] = [
  DocumentType.INVOICE,
  DocumentType.E_INVOICE_XML
];
