import type { Declaration as BackendDeclaration } from "@/api/types/declaration.types";
import type { DocumentType, NormalizedDeclaration, UploadedDocument } from "@/api/types/document.types";
import { mergeNormalizedFromApi } from "@/api/types/document.types";
import type {
  BeyannameDocCheckItem,
  BeyannameFormFields,
  BeyannameLineItem,
  BeyannameListeItem,
  BeyannameListeStatus,
  BeyannameRecord,
  BeyannameStatus,
  BeyannameWritingField,
  ParsedSourceCard,
  TransportMode
} from "@/types";

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  INVOICE: "Fatura",
  E_INVOICE_XML: "e-Fatura XML",
  EXPORT_INVOICE: "İhracat Faturası",
  PACKING_LIST: "Çeki Listesi",
  PROFORMA: "Proforma",
  BILL_OF_LADING_INSTRUCTION: "Konşimento Talimatı",
  OTHER: "Diğer"
};

const STATUS_TO_BEYANNAME: Record<string, BeyannameStatus> = {
  DRAFT: "taslak",
  READY: "kontrol",
  XML_GENERATED: "tescilli",
  ERROR: "bekliyor"
};

const STATUS_TO_LISTE: Record<string, BeyannameListeStatus> = {
  DRAFT: "yazim-bekliyor",
  READY: "onaya-hazir",
  XML_GENERATED: "onaya-hazir",
  ERROR: "kontrol-uyarisi"
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Yazım Bekliyor",
  READY: "Onaya Hazır",
  XML_GENERATED: "XML Üretildi",
  ERROR: "Hata"
};

export function refFromId(id: string): string {
  const tail = id.replace(/[^a-f0-9]/gi, "").slice(-6).toUpperCase();
  return tail ? `DCL-${tail}` : "DCL-000";
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("tr-TR");
}

function formatRelative(iso?: string): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Az önce";
  if (mins < 60) return `${mins} dk önce`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} sa önce`;
  return formatDate(iso);
}

function formatAmount(amount?: number, currency?: string): string {
  if (amount == null) return "—";
  const cur = currency ?? "";
  return `${amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`.trim();
}

function mapTransportMode(mode?: string): TransportMode | null {
  if (!mode) return null;
  const m = mode.toLowerCase();
  if (m.includes("deniz") || m.includes("sea")) return "denizyolu";
  if (m.includes("hava") || m.includes("air")) return "havayolu";
  return "karayolu";
}

function transportLabel(mode?: string): string {
  const mapped = mapTransportMode(mode);
  if (mapped === "denizyolu") return "Denizyolu";
  if (mapped === "havayolu") return "Havayolu";
  return mode ?? "Karayolu";
}

export function toFormFields(norm: NormalizedDeclaration): BeyannameFormFields {
  const h = norm.header;
  const pkg = norm.packageInfo;
  const firstLine = norm.goodsLines[0];
  const kap = pkg.totalPackage != null ? `${pkg.totalPackage} KAP` : "—";
  const kg = pkg.grossKg != null ? `${pkg.grossKg.toLocaleString("tr-TR")} KG` : "—";
  return {
    beyan: (norm.evrimHeader?.rejim as string) ?? "10 — İhracat",
    gumrukIdaresi: (norm.evrimHeader?.gumrukIdaresi as string) ?? "—",
    referansNo: h.invoiceNo ?? "—",
    tescilTarihi: formatDate(h.invoiceDate),
    gonderici: norm.parties.seller?.name ?? "—",
    alici: norm.parties.buyer?.name ?? "—",
    teslimSekli: norm.trade.deliveryTerm ?? "—",
    doviz: h.currency ?? "—",
    toplamFatura: formatAmount(h.totalAmount, h.currency),
    kapBrut: pkg.totalPackage != null || pkg.grossKg != null ? `${kap} / ${kg}` : "—",
    ticariTanim:
      firstLine?.description ??
      (norm.goodsLines.map((l) => l.description).filter(Boolean).join(" / ") || "—")
  };
}

function toWritingFields(norm: NormalizedDeclaration, sourceTrace?: BackendDeclaration["sourceTrace"]): BeyannameWritingField[] {
  const entries: BeyannameWritingField[] = [
    { key: "gonderici", label: "Gönderici", value: norm.parties.seller?.name ?? "—", source: traceSource(sourceTrace, "parties.seller.name"), conflict: false },
    { key: "alici", label: "Alıcı", value: norm.parties.buyer?.name ?? "—", source: traceSource(sourceTrace, "parties.buyer.name"), conflict: false },
    { key: "beyan", label: "Beyan", value: (norm.evrimHeader?.rejim as string) ?? "10 — İhracat", source: "Manuel", conflict: false },
    { key: "referans", label: "Referans", value: norm.header.invoiceNo ?? "—", source: traceSource(sourceTrace, "header.invoiceNo"), conflict: false },
    { key: "fatura", label: "Fatura", value: `${formatDate(norm.header.invoiceDate)} / ${norm.header.invoiceNo ?? "—"}`, source: traceSource(sourceTrace, "header.invoiceNo"), conflict: false },
    { key: "teslim", label: "Teslim Şekli", value: norm.trade.deliveryTerm ?? "—", source: traceSource(sourceTrace, "trade.deliveryTerm"), conflict: false },
    { key: "kiymet", label: "Kıymet", value: formatAmount(norm.header.totalAmount, norm.header.currency), source: traceSource(sourceTrace, "header.totalAmount"), conflict: false }
  ];
  if (norm.packageInfo.totalPackage != null) {
    entries.push({
      key: "kap",
      label: "Kap Adedi",
      value: String(norm.packageInfo.totalPackage),
      source: traceSource(sourceTrace, "packageInfo.totalPackage"),
      conflict: hasConflict(sourceTrace, "packageInfo.totalPackage")
    });
  }
  if (norm.packageInfo.grossKg != null) {
    entries.push({
      key: "kilo",
      label: "Brüt Kilo",
      value: `${norm.packageInfo.grossKg} KG`,
      source: traceSource(sourceTrace, "packageInfo.grossKg"),
      conflict: hasConflict(sourceTrace, "packageInfo.grossKg")
    });
  }
  return entries;
}

function traceSource(sourceTrace: BackendDeclaration["sourceTrace"] | undefined, key: string): string {
  const entry = sourceTrace?.[key];
  if (!entry?.source) return "—";
  const src = String(entry.source);
  return DOC_TYPE_LABELS[src as DocumentType] ?? src;
}

function hasConflict(_sourceTrace: BackendDeclaration["sourceTrace"] | undefined, _key: string): boolean {
  return false;
}

function toLineItems(norm: NormalizedDeclaration): BeyannameLineItem[] {
  return norm.goodsLines.map((line) => ({
    lineNo: line.lineNo,
    gtip: line.hsCode ?? "—",
    description: line.description ?? "—",
    quantity: line.quantity != null ? `${line.quantity} ${line.unit ?? ""}`.trim() : "—",
    mense: line.origin ?? norm.trade.origin ?? "—",
    brutKg: line.grossKg != null ? line.grossKg.toLocaleString("tr-TR") : "—",
    netKg: line.netKg != null ? line.netKg.toLocaleString("tr-TR") : "—",
    kiymet: line.lineTotal != null ? line.lineTotal.toLocaleString("tr-TR") : "—"
  }));
}

export function toDocCheckItems(docs: UploadedDocument[]): BeyannameDocCheckItem[] {
  return docs.map((doc) => ({
    id: doc._id,
    name: DOC_TYPE_LABELS[doc.type] ?? doc.type,
    status: doc.extractionStatus === "SUCCESS" ? "geldi" : doc.extractionStatus === "FAILED" ? "eksik" : "kosullu",
    note: doc.fileName ?? doc.extractionStatus
  }));
}

export function toBeyannameListeItem(d: BackendDeclaration, docCount = 0): BeyannameListeItem {
  const norm = mergeNormalizedFromApi(d.normalizedData);
  return {
    id: d._id,
    ref: refFromId(d._id),
    date: formatDate(d.createdAt),
    customer: norm.parties.buyer?.name ?? norm.parties.seller?.name ?? "—",
    customerCity: norm.parties.buyer?.country ?? norm.parties.seller?.country ?? "—",
    islemTipi: "İhracat",
    status: STATUS_TO_LISTE[d.status] ?? "yazim-bekliyor",
    transportMode: mapTransportMode(norm.transport.mode),
    lineCount: norm.goodsLines.length,
    docCount,
    totalDocCount: docCount,
    warningCount: d.status === "ERROR" ? 1 : 0,
    missingDocuments: [],
    gtipStatus: d.status === "ERROR" ? "uyumsuz" : "uygun",
    assignee: "—",
    updatedAt: formatRelative(d.updatedAt ?? d.createdAt)
  };
}

export function toBeyannameRecord(d: BackendDeclaration, docs: UploadedDocument[]): BeyannameRecord {
  const norm = mergeNormalizedFromApi(d.normalizedData);
  const received = docs.filter((doc) => doc.extractionStatus === "SUCCESS").length;
  const formFields = toFormFields(norm);
  const fields = toWritingFields(norm, d.sourceTrace);
  return {
    id: d._id,
    ref: refFromId(d._id),
    tescilNo: d.generatedXmlPath ? refFromId(d._id) : "—",
    customer: norm.parties.buyer?.name ?? norm.parties.seller?.name ?? "—",
    customerId: d.companyId,
    rejim: (norm.evrimHeader?.rejim as string) ?? "10 — İhracat",
    durumLabel: STATUS_LABELS[d.status] ?? d.status,
    status: STATUS_TO_BEYANNAME[d.status] ?? "taslak",
    transportMode: transportLabel(norm.transport.mode),
    docCount: received,
    lateDocCount: Math.max(0, docs.length - received),
    lineCount: norm.goodsLines.length,
    warningCount: d.status === "ERROR" ? 1 : 0,
    formFields,
    fieldValues: {
      "Referans No": formFields.referansNo,
      "Gönderici / İhracatçı Ünvanı": formFields.gonderici,
      "Alıcı / İthalatçı Ünvanı": formFields.alici,
      "Teslim Şekli": formFields.teslimSekli,
      "Toplam Fatura Tutarı": formFields.toplamFatura,
    },
    fieldMappings: [],
    fields,
    lineItems: toLineItems(norm),
    docs: toDocCheckItems(docs)
  };
}

export function toSourceCards(d: BackendDeclaration): ParsedSourceCard[] {
  const norm = mergeNormalizedFromApi(d.normalizedData);
  const cards: ParsedSourceCard[] = [];

  if (d.sourceTrace && Object.keys(d.sourceTrace).length > 0) {
    const items = Object.entries(d.sourceTrace).slice(0, 8).map(([key, entry]) => ({
      label: key.split(".").pop() ?? key,
      value: entry.value != null ? String(entry.value) : "—"
    }));
    cards.push({
      id: `src-trace-${d._id}`,
      title: "Kaynak İzleme",
      subtitle: "Normalizasyon kaynakları",
      fields: [],
      page: 0,
      items
    });
  }

  if (norm.parties.seller?.name || norm.parties.buyer?.name) {
    cards.push({
      id: `src-parties-${d._id}`,
      title: "Taraf Bilgileri",
      subtitle: "Satıcı / Alıcı",
      fields: ["boxSender", "boxReceiver"],
      page: 0,
      items: [
        { label: "Gönderici", value: norm.parties.seller?.name ?? "—" },
        { label: "Alıcı", value: norm.parties.buyer?.name ?? "—" },
        { label: "Teslim Şekli", value: norm.trade.deliveryTerm ?? "—" },
        { label: "Kıymet", value: formatAmount(norm.header.totalAmount, norm.header.currency) }
      ]
    });
  }

  if (norm.goodsLines.length > 0) {
    cards.push({
      id: `src-lines-${d._id}`,
      title: "Kalem Bilgileri",
      subtitle: `${norm.goodsLines.length} kalem`,
      fields: ["boxGtip", "boxItem", "boxWeight"],
      page: 1,
      items: [
        { label: "Kalem Sayısı", value: `${norm.goodsLines.length} kalem` },
        { label: "Toplam Kilo", value: norm.packageInfo.grossKg != null ? `${norm.packageInfo.grossKg} KG` : "—" },
        { label: "Kap Adedi", value: norm.packageInfo.totalPackage != null ? `${norm.packageInfo.totalPackage} kap` : "—" },
        { label: "GTİP (1. Kalem)", value: norm.goodsLines[0]?.hsCode ?? "—" }
      ]
    });
  }

  return cards;
}

export function toPanelDeclaration(d: BackendDeclaration) {
  const norm = mergeNormalizedFromApi(d.normalizedData);
  return {
    id: d._id,
    ref: refFromId(d._id),
    customer: norm.parties.buyer?.name ?? norm.parties.seller?.name ?? "—",
    status: STATUS_TO_BEYANNAME[d.status] ?? "taslak",
    tescilNo: d.generatedXmlPath ? refFromId(d._id) : undefined,
    createdAt: d.createdAt ?? new Date().toISOString()
  };
}
