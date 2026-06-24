import type { DocumentType, UploadedDocument } from "@/api/types/document.types";
import type { Document, EvrakDocRow, EvrakFile } from "@/types";
import { refFromId, toDocCheckItems } from "@/api/adapters/declarationAdapter";
import type { Declaration as BackendDeclaration } from "@/api/types/declaration.types";
import { mergeNormalizedFromApi } from "@/api/types/document.types";

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  INVOICE: "Fatura",
  E_INVOICE_XML: "e-Fatura XML",
  EXPORT_INVOICE: "İhracat Faturası",
  PACKING_LIST: "Çeki Listesi",
  PROFORMA: "Proforma",
  BILL_OF_LADING_INSTRUCTION: "Konşimento Talimatı",
  OTHER: "Diğer"
};

export function toEvrakFile(d: BackendDeclaration, docs: UploadedDocument[]): EvrakFile {
  const missing = docs.filter((doc) => doc.extractionStatus !== "SUCCESS").length;
  const allReady = docs.length > 0 && missing === 0;
  return {
    id: d._id,
    ref: refFromId(d._id),
    customer: mergeNormalizedFromApi(d.normalizedData).parties.buyer?.name ?? "—",
    meta: missing > 0 ? `${missing} eksik evrak` : docs.length === 0 ? "Evrak bekleniyor" : "Tüm evraklar geldi",
    allReady
  };
}

export function toEvrakDocRows(docs: UploadedDocument[]): EvrakDocRow[] {
  return docs.map((doc) => ({
    id: doc._id,
    name: DOC_TYPE_LABELS[doc.type] ?? doc.type,
    required: "Evet",
    status: doc.extractionStatus === "SUCCESS" ? "Geldi" : doc.extractionStatus === "FAILED" ? "Eksik" : "Koşullu",
    source: doc.fileName ?? "Yükleme",
    lastAction: doc.updatedAt ? new Date(doc.updatedAt).toLocaleString("tr-TR") : "—",
    note: doc.parseErrors?.join(", ") ?? doc.extractionStatus
  }));
}

export function toLegacyDocument(doc: UploadedDocument): Document {
  return {
    id: doc._id,
    name: DOC_TYPE_LABELS[doc.type] ?? doc.type,
    type: doc.type.toLowerCase(),
    status: doc.extractionStatus === "SUCCESS" ? "uploaded" : "missing",
    fileRef: doc.declarationId,
    uploadedAt: doc.createdAt
  };
}

export { toDocCheckItems };
