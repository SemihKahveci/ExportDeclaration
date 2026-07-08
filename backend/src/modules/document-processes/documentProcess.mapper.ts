import type { DocumentProcessDoc } from "./documentProcess.model.js";

export interface DocumentProcessDto {
  id: string;
  name: string;
  process: string;
  format: string;
  parseable: "Evet" | "Hayır";
  testResult: "Başarılı" | "Kısmi Başarılı" | "Test Bekliyor" | "Başarısız";
  successRate: string;
  supportNote: string;
  status: "Aktif" | "Pasif";
}

export function toDocumentProcessDto(doc: DocumentProcessDoc): DocumentProcessDto {
  return {
    id: String(doc._id),
    name: doc.name,
    process: doc.process,
    format: doc.format ?? "—",
    parseable: doc.parseable,
    testResult: doc.testResult,
    successRate: doc.successRate ?? "—",
    supportNote: doc.supportNote ?? "",
    status: doc.status
  };
}
