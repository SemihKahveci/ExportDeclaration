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
  ATR: "ATR",
  EUR1: "EUR.1",
  CERTIFICATE_OF_ORIGIN: "Menşe Şahadetnamesi",
  BILL_OF_LADING: "Konşimento",
  CMR: "CMR",
  AWB: "AWB",
  BOOKING: "Booking",
  INSURANCE_POLICY: "Sigorta Poliçesi",
  SUMMARY_DECLARATION: "Özet Beyan Bilgisi",
  PROFORMA: "Proforma",
  BILL_OF_LADING_INSTRUCTION: "Konşimento Talimatı",
  OTHER: "Diğer"
};

export function toEvrakFile(d: BackendDeclaration, docs: UploadedDocument[]): EvrakFile {
  const pending = docs.filter((doc) => doc.extractionStatus === "PENDING").length;
  const review = docs.filter((doc) => doc.extractionStatus === "MANUAL_REQUIRED").length;
  const failed = docs.filter((doc) => doc.extractionStatus === "FAILED").length;
  const allReady = docs.length > 0 && docs.every((doc) => doc.extractionStatus === "SUCCESS");

  let meta = "Tüm evraklar işlendi";
  if (docs.length === 0) meta = "Evrak bekleniyor";
  else if (pending > 0) meta = `${pending} evrak IDP tarafından işleniyor`;
  else if (review > 0) meta = `${review} evrak inceleme bekliyor`;
  else if (failed > 0) meta = `${failed} evrak işlenemedi`;

  return {
    id: d._id,
    ref: refFromId(d),
    customer: d.operation?.customerName
      ?? mergeNormalizedFromApi(d.normalizedData).parties.buyer?.name
      ?? mergeNormalizedFromApi(d.normalizedData).parties.seller?.name
      ?? "—",
    customerId: d.operation?.customerId,
    meta,
    allReady,
    processing: pending > 0
  };
}

export function toEvrakDocRows(docs: UploadedDocument[]): EvrakDocRow[] {
  return docs.map((doc) => {
    const status: EvrakDocRow["status"] =
      doc.extractionStatus === "SUCCESS" ? "Geldi" :
      doc.extractionStatus === "FAILED" ? "Eksik" :
      doc.extractionStatus === "MANUAL_REQUIRED" ? "İnceleme" :
      "İşleniyor";

    const note = doc.parseErrors?.length
      ? doc.parseErrors.join(", ")
      : doc.extractionStatus === "PENDING"
        ? "Qwen / IDP işleme kuyruğunda veya çalışıyor"
        : doc.extractionStatus === "MANUAL_REQUIRED"
          ? "Foundation 6 insan kararı bekliyor"
          : doc.extractionStatus === "SUCCESS"
            ? "IDP tamamlandı; güvenilir alanlar beyannameye aktarıldı"
            : "IDP işleme başarısız";

    return {
      id: doc._id,
      name: DOC_TYPE_LABELS[doc.type] ?? doc.type,
      required: "Evet",
      status,
      source: doc.fileName ?? "Yükleme",
      lastAction: doc.updatedAt ? new Date(doc.updatedAt).toLocaleString("tr-TR") : "—",
      note
    };
  });
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
