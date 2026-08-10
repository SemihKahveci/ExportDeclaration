import {
  createDeclaration,
  getDeclaration,
  listDeclarations,
  patchDeclaration,
} from "@/api/declarationApi";
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
import type { BeyannameListeItem, BeyannameRecord, CustomsFile, KapanicFile, TescilRecord } from "@/types";

/** API kullanılsın mı? Varsayılan: evet (VITE_USE_API=false ile kapatılır). */
export function liveApiEnabled(): boolean {
  return import.meta.env.VITE_USE_API !== "false";
}

const DOC_LABEL_TO_TYPE: Record<string, DocumentType> = {
  Fatura: "INVOICE",
  "e-Fatura XML": "E_INVOICE_XML",
  "İhracat Faturası": "EXPORT_INVOICE",
  "Çeki Listesi": "PACKING_LIST",
  "Paketleme Listesi": "PACKING_LIST",
  Proforma: "PROFORMA",
  Konşimento: "BILL_OF_LADING_INSTRUCTION",
  "Navlun Makbuzu": "OTHER",
  CMR: "OTHER",
  AWB: "OTHER",
  "A.TR Dolaşım Belgesi": "OTHER",
  "Menşe Şahadetnamesi": "OTHER",
  "Tesellüm Tutanağı": "OTHER",
  "Beyanname Taslağı": "OTHER",
};

export function mapDocLabelToType(label: string): DocumentType {
  return DOC_LABEL_TO_TYPE[label] ?? "OTHER";
}

export async function fetchDeclarationsFromApi() {
  if (!liveApiEnabled()) return null;
  try {
    return await listDeclarations();
  } catch {
    return null;
  }
}

export async function fetchPanelDeclarations() {
  const rows = await fetchDeclarationsFromApi();
  if (rows === null) return null;
  return rows.map(toPanelDeclaration);
}

export async function fetchBeyannameListeItems(): Promise<BeyannameListeItem[] | null> {
  const rows = await fetchDeclarationsFromApi();
  if (rows === null) return null;
  return Promise.all(
    rows.map(async (row) => {
      const docs = await listDocuments(row._id).catch(() => []);
      return toBeyannameListeItem(row, docs.length);
    })
  );
}

export async function fetchBeyannameRecords(): Promise<BeyannameRecord[] | null> {
  const rows = await fetchDeclarationsFromApi();
  if (rows === null) return null;
  return Promise.all(
    rows.map(async (row) => {
      const docs = await listDocuments(row._id).catch(() => []);
      return toBeyannameRecord(row, docs);
    })
  );
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
  await uploadDocument(id, file, mapDocLabelToType(docTypeLabel));
}

export async function fetchCustomsFiles(): Promise<CustomsFile[] | null> {
  const rows = await fetchDeclarationsFromApi();
  if (rows === null) return null;
  return rows.map(toCustomsFile);
}

export async function fetchTescilRecords(): Promise<TescilRecord[] | null> {
  const rows = await fetchDeclarationsFromApi();
  if (rows === null) return null;
  return rows
    .filter((r) => r.operation?.fileStatus === "tescil" || r.operation?.tescilStatus === "started")
    .filter((r) => r.operation?.tescilStatus !== "completed")
    .map(toTescilRecord);
}

export async function fetchKapanisFiles(): Promise<KapanicFile[] | null> {
  const rows = await fetchDeclarationsFromApi();
  if (rows === null) return null;
  return rows
    .filter(
      (r) =>
        r.operation?.fileStatus === "kapanis-bekleyen" ||
        (r.operation?.kapanisStatus && r.operation.kapanisStatus !== "kapandi")
    )
    .map(toKapanicFile);
}

export async function fetchEvrakFiles() {
  const rows = await fetchDeclarationsFromApi();
  if (rows === null) return null;
  return Promise.all(
    rows.map(async (row) => {
      const docs = await listDocuments(row._id).catch(() => []);
      return toEvrakFile(row, docs);
    })
  );
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
