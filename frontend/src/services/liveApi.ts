import {
  createDeclaration,
  getDeclaration,
  listDeclarationDocumentSummaries,
  listDeclarationParseStatuses,
  listDeclarations,
  patchDeclaration,
} from "@/api/declarationApi";
import type { UploadedDocument } from "@/api/types/document.types";
import type { OperationMeta } from "@/api/types/declaration.types";
import {
  toBeyannameListeItem,
  toBeyannameRecord,
  toPanelDeclaration,
  refFromId,
} from "@/api/adapters/declarationAdapter";
import { toCustomsFile } from "@/api/adapters/fileAdapter";
import { toEvrakDocRows, toEvrakFile } from "@/api/adapters/documentAdapter";
import {
  toTescilRecord,
  toKapanicFile,
} from "@/api/adapters/operationAdapter";
import { listDocuments, uploadDocument } from "@/api/documentApi";
import type { DocumentType } from "@/api/types/document.types";
import type { BeyannameListeItem, BeyannameRecord, CustomsFile, DocPreviewData, KapanicFile, TescilRecord } from "@/types";

/** API kullanılsın mı? Varsayılan: evet (VITE_USE_API=false ile kapatılır). */
export function liveApiEnabled(): boolean {
  return import.meta.env.VITE_USE_API !== "false";
}

const DOC_LABEL_TO_TYPE: Record<string, DocumentType> = {
  Fatura: "INVOICE",
  Invoice: "EXPORT_INVOICE",
  "e-Fatura XML": "E_INVOICE_XML",
  "İhracat Faturası": "EXPORT_INVOICE",
  "Çeki Listesi": "PACKING_LIST",
  "Paketleme Listesi": "PACKING_LIST",
  Proforma: "PROFORMA",
  Konşimento: "BILL_OF_LADING_INSTRUCTION",
  "Navlun Makbuzu": "OTHER",
  CMR: "CMR",
  AWB: "AWB",
  Booking: "BOOKING",
  "Dolaşım Belgesi": "ATR",
  "A.TR Dolaşım Belgesi": "ATR",
  ATR: "ATR",
  "EUR.1": "EUR1",
  "Menşe Şahadetnamesi": "CERTIFICATE_OF_ORIGIN",
  "Sigorta Poliçesi": "INSURANCE_POLICY",
  "Özet Beyan Bilgisi": "SUMMARY_DECLARATION",
  "Tesellüm Tutanağı": "OTHER",
  "Beyanname Taslağı": "OTHER",
};

export function mapDocLabelToType(label: string): DocumentType {
  return DOC_LABEL_TO_TYPE[label] ?? "OTHER";
}

export async function fetchDeclarationsFromApi(scope?: "all" | "mine") {
  if (!liveApiEnabled()) return null;
  try {
    return await listDeclarations(scope);
  } catch {
    return null;
  }
}

export async function fetchPanelDeclarations() {
  const rows = await fetchDeclarationsFromApi();
  if (rows === null) return null;
  return rows.map(toPanelDeclaration);
}

async function documentsByDeclaration(): Promise<Map<string, UploadedDocument[]> | null> {
  if (!liveApiEnabled()) return null;
  try {
    const docs = await listDeclarationDocumentSummaries();
    const map = new Map<string, UploadedDocument[]>();
    for (const doc of docs) {
      const key = String(doc.declarationId);
      const group = map.get(key) ?? [];
      group.push(doc);
      map.set(key, group);
    }
    return map;
  } catch {
    return null;
  }
}

export async function fetchBeyannameListeItems(): Promise<BeyannameListeItem[] | null> {
  const [rows, docsMap] = await Promise.all([fetchDeclarationsFromApi(), documentsByDeclaration()]);
  if (rows === null || docsMap === null) return null;
  return rows.map((row) => toBeyannameListeItem(row, docsMap.get(row._id) ?? []));
}

export async function fetchBeyannameRecords(): Promise<BeyannameRecord[] | null> {
  const [rows, docsMap] = await Promise.all([fetchDeclarationsFromApi(), documentsByDeclaration()]);
  if (rows === null || docsMap === null) return null;
  return rows.map((row) => toBeyannameRecord(row, docsMap.get(row._id) ?? []));
}

export async function resolveDeclarationIdByRef(ref: string): Promise<string | null> {
  const rows = await fetchDeclarationsFromApi();
  if (rows === null) return null;
  const match = rows.find((r) => refFromId(r) === ref || r._id === ref);
  return match?._id ?? null;
}

export async function apiCreateDeclaration(operation?: Partial<OperationMeta>) {
  const row = await createDeclaration(operation ? { operation } : undefined);
  return toPanelDeclaration(row);
}

export async function apiCreateOperationFile(payload: {
  customerId?: string;
  customerName: string;
  customerCity: string;
  operationType: string;
  transportMode?: string | null;
  assigneeName?: string | null;
  cutoffAt?: string | null;
  lastActivity?: string;
}) {
  const opTypeMap: Record<string, string> = {
    İhracat: "ihracat",
    İthalat: "ithalat",
    Transit: "transit",
    Antrepo: "antrepo",
  };
  const transportMap: Record<string, string> = {
    Karayolu: "karayolu",
    Denizyolu: "denizyolu",
    Havayolu: "havayolu",
  };
  const row = await createDeclaration({
    operation: {
      customerId: payload.customerId,
      customerName: payload.customerName,
      customerCity: payload.customerCity,
      operationType: opTypeMap[payload.operationType] ?? payload.operationType,
      transportMode: payload.transportMode
        ? transportMap[payload.transportMode] ?? payload.transportMode
        : null,
      assigneeName: payload.assigneeName,
      cutoffAt: payload.cutoffAt,
      fileStatus: "yeni-talep",
      lastActivity: payload.lastActivity ?? "Yeni talep oluşturuldu",
    },
  });
  return toCustomsFile(row);
}

export async function apiPatchOperation(id: string, operation: Partial<OperationMeta>) {
  return patchDeclaration(id, { operation });
}

export async function apiUploadByRef(ref: string, file: File, docTypeLabel: string) {
  const id = await resolveDeclarationIdByRef(ref);
  if (!id) throw new Error("Beyanname bulunamadı");
  return uploadDocument(id, file, mapDocLabelToType(docTypeLabel));
}

export async function fetchCustomsFiles(scope?: "all" | "mine"): Promise<CustomsFile[] | null> {
  const rows = await fetchDeclarationsFromApi(scope);
  if (rows === null) return null;
  return rows.map(toCustomsFile);
}

export async function fetchTescilRecords(): Promise<TescilRecord[] | null> {
  const rows = await fetchDeclarationsFromApi();
  if (rows === null) return null;
  return rows
    .filter((r) => r.operation?.fileStatus === "tescil" || Boolean(r.operation?.tescilStatus))
    .map(toTescilRecord);
}

export async function fetchKapanisFiles(): Promise<KapanicFile[] | null> {
  const rows = await fetchDeclarationsFromApi();
  if (rows === null) return null;
  return rows
    .filter(
      (r) =>
        r.operation?.fileStatus === "kapanis-bekleyen" ||
        r.operation?.fileStatus === "kapandi" ||
        Boolean(r.operation?.kapanisStatus)
    )
    .map(toKapanicFile);
}

export async function fetchEvrakFiles() {
  const [rows, docsMap] = await Promise.all([fetchDeclarationsFromApi(), documentsByDeclaration()]);
  if (rows === null || docsMap === null) return null;
  return rows.map((row) => toEvrakFile(row, docsMap.get(row._id) ?? []));
}

export async function fetchParseSnapshot(): Promise<Array<{ id: string; ref: string; name: string; status: string }> | null> {
  if (!liveApiEnabled()) return null;
  try {
    return await listDeclarationParseStatuses();
  } catch {
    return null;
  }
}

export async function fetchEvrakDocs(declarationId: string) {
  if (!liveApiEnabled()) return null;
  try {
    const docs = await listDocuments(declarationId);
    return toEvrakDocRows(docs);
  } catch {
    return null;
  }
}

export async function fetchDeclarationById(id: string) {
  if (!liveApiEnabled()) return null;
  try {
    const row = await getDeclaration(id);
    const docs = await listDocuments(id).catch(() => []);
    return toBeyannameRecord(row, docs);
  } catch {
    return null;
  }
}

export async function fetchSourceCardsById(id: string) {
  if (!liveApiEnabled()) return null;
  try {
    const row = await getDeclaration(id);
    const { toSourceCards } = await import("@/api/adapters/declarationAdapter");
    return toSourceCards(row);
  } catch {
    return null;
  }
}

export async function fetchEvrakPreview(declarationId: string, documentId: string): Promise<DocPreviewData | null> {
  if (!liveApiEnabled()) return null;
  try {
    const [declaration, docs] = await Promise.all([
      getDeclaration(declarationId),
      listDocuments(declarationId),
    ]);
    const doc = docs.find((item) => item._id === documentId);
    if (!doc) return null;

    const norm = declaration.normalizedData;
    const normalized = (await import("@/api/types/document.types")).mergeNormalizedFromApi(norm);
    const firstHs = normalized.goodsLines.find((line) => line.hsCode)?.hsCode ?? "—";
    const packageCount = normalized.packageInfo.totalPackage;
    const grossKg = normalized.packageInfo.grossKg;
    const status = doc.extractionStatus === "SUCCESS" ? "Geldi"
      : doc.extractionStatus === "MANUAL_REQUIRED" ? "İnceleme"
      : doc.extractionStatus === "FAILED" ? "Eksik" : "İşleniyor";

    return {
      docName: ({
        INVOICE: "Fatura",
        E_INVOICE_XML: "e-Fatura XML",
        EXPORT_INVOICE: "Invoice",
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
      } as Record<string, string>)[doc.type] ?? doc.type,
      kap: packageCount == null ? "—" : String(packageCount),
      kilo: grossKg == null ? "—" : `${grossKg.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KG`,
      gtip: firstHs,
      parseSource: "Kaynak: Foundation 6 tarafından promote edilmiş persisted normalizedData",
      status,
      origin: doc.fileName ?? "Yükleme",
      lastAction: doc.updatedAt ? new Date(doc.updatedAt).toLocaleString("tr-TR") : "—",
    };
  } catch {
    return null;
  }
}
