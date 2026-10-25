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

function fileStage(d: BackendDeclaration): string {
  const operation = d.operation;
  if (!operation) return "";
  if (operation.fileStatus === "beklemede" && operation.holdPreviousStatus) return operation.holdPreviousStatus;
  return operation.fileStatus ?? "";
}

function listeStatusOf(d: BackendDeclaration): BeyannameListeStatus {
  if (d.status === "ERROR") return "kontrol-uyarisi";
  const stage = fileStage(d);
  if (stage === "gtip-eksik") return "gtip-eksik";
  if (stage === "gtip-hazirlik") return "gtip-hazirlik";
  if (stage === "beyanname-yazim" || d.approvalWorkflow?.status === "RETURNED") return "beyanname-yazimda";
  if (d.status === "READY" || d.status === "XML_GENERATED") return "onaya-hazir";
  if (stage === "ic-kontrol") return "kontrol-bekliyor";
  return STATUS_TO_LISTE[d.status] ?? "yazim-bekliyor";
}

function durumLabelOf(d: BackendDeclaration): string {
  const status = listeStatusOf(d);
  if (status === "beyanname-yazimda") return "Beyanname Yazımda";
  if (status === "kontrol-bekliyor") return "Beyanname Yazım Onayında";
  if (status === "gtip-hazirlik") return "GTİP Hazırlıkta";
  if (status === "gtip-eksik") return "GTİP Eksik/Hatalı";
  if (status === "onaya-hazir") return "Onaya Hazır";
  if (status === "kontrol-uyarisi") return "Kontrol Uyarısı";
  return "Yazım Bekliyor";
}

export function refFromId(d: BackendDeclaration | string): string {
  if (typeof d === "string") {
    const tail = d.replace(/[^a-f0-9]/gi, "").slice(-6).toUpperCase();
    return tail ? `DCL-${tail}` : "DCL-000";
  }
  return d.operation?.ref ?? refFromId(d._id);
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

function toWritingFieldValues(norm: NormalizedDeclaration, op?: BackendDeclaration["operation"]): Record<string, string> {
  const h = norm.header;
  const pkg = norm.packageInfo;
  const seller = norm.parties.seller;
  const buyer = norm.parties.buyer;
  const evrim = norm.evrimHeader ?? {};
  const text = (value: unknown): string => value == null || value === "" ? "" : String(value);
  const number = (value: number | undefined): string => value == null ? "" : value.toLocaleString("tr-TR");

  // This map is intentionally fed only from persisted Declaration.normalizedData / operation.
  // Qwen raw output and UploadedDocument.extractedData are not writing-form authorities.
  return {
    "Beyanname No": op?.declarationNo ?? "",
    // Business authority: reference/registration date are supplied by Evrim,
    // never borrowed from invoice identity/date.
    "Referans No": text(evrim.fileReference) || op?.ref || "",
    "Tescil Tarihi": typeof evrim.declarationDate === "string" && evrim.declarationDate
      ? formatDate(evrim.declarationDate)
      : "",
    "Rejim": text(evrim.rejim),
    "Rejim Kodu": text(evrim.rejimKodu),
    "Gümrük İdaresi": text(evrim.gumrukIdaresi),
    "Beyan Sahibi / Temsilci": text(evrim.beyanSahibi),
    "İşlem Niteliği": op?.operationType ?? "",
    "Beyan Türü": text(evrim.beyanTuru),

    "Gönderici / İhracatçı Ünvanı": seller?.name ?? "",
    "Gönderici / İhracatçı Adresi": seller?.address ?? "",
    "Alıcı / İthalatçı Ünvanı": buyer?.name ?? "",
    "Alıcı / İthalatçı Adresi": buyer?.address ?? "",

    "Gönderici Ülke": seller?.country ?? "",
    "Alıcı Ülke": buyer?.country ?? "",
    "Çıkış Ülkesi": norm.trade.exitCountry ?? text(evrim.cikisUlkesi),
    "Varış Ülkesi": norm.trade.arrivalCountry ?? text(evrim.varisUlkesi),
    "Gideceği Ülke": norm.trade.destinationCountry ?? text(evrim.gidecegiUlke),
    "Menşe Ülke": norm.trade.origin ?? "",
    "Ticaret Yapılan Ülke": norm.trade.tradeCountry ?? text(evrim.ticaretYapilanUlke),
    "Teslim Şekli": norm.trade.deliveryTerm ?? "",

    // Document-owned writing field: operation metadata must not fabricate a value
    // when the invoice did not promote transport evidence.
    "Taşıma Şekli": norm.transport.mode ?? "",
    "Taşıyıcı / Nakliyeci": norm.transport.carrier ?? "",
    "Çıkış Aracı": norm.transport.departureVehicleId ?? "",
    "Sınır Geçiş Aracı": norm.transport.borderVehicleId ?? "",
    "Plaka": norm.transport.vehiclePlate ?? "",
    "Konteyner No": norm.transport.containerNo ?? "",
    "Konşimento No": norm.transport.billOfLadingNo ?? "",
    "CMR No": norm.transport.cmrNo ?? "",
    "AWB No": norm.transport.awbNo ?? "",
    "Taşıma Senedi No": norm.transport.transportDocumentNo ?? "",
    "Fatura No": h.invoiceNo ?? "",
    "Fatura Tarihi": h.invoiceDate ? formatDate(h.invoiceDate) : "",
    "Döviz Cinsi": h.currency ?? "",
    "Toplam Fatura Bedeli": h.totalAmount == null ? "" : formatAmount(h.totalAmount, h.currency),
    "Döviz Kuru": number(norm.finance?.exchangeRate),
    "Navlun": number(norm.finance?.freight),
    "Sigorta": number(norm.finance?.insurance),
    "Ödeme Şekli": norm.trade.paymentType ?? "",
    "Finansal / Banka Bilgisi": norm.finance?.bankInfo ?? "",

    "Kap Adedi": number(pkg.totalPackage),
    "Kap Cinsi": pkg.packageType ?? "",
    "Brüt Kilo": number(pkg.grossKg),
    "Net Kilo": number(pkg.netKg),

    "Önceki Belge No": norm.documents?.previousDocumentNo ?? "",
    "Dolaşım Belgesi No": norm.documents?.circulationDocumentNo ?? "",
    "Menşe Belgesi No": norm.documents?.originDocumentNo ?? "",
  };
}

function toLineItems(norm: NormalizedDeclaration): BeyannameLineItem[] {
  return norm.goodsLines.map((line) => ({
    lineNo: line.lineNo,
    gtip: line.hsCode ?? "—",
    malzemeNo: line.productCode,
    faturaNo: line.invoiceNo,
    description: line.description ?? "—",
    quantity: line.quantity != null ? String(line.quantity) : "—",
    mense: line.origin ?? norm.trade.origin ?? "—",
    brutKg: line.grossKg != null ? line.grossKg.toLocaleString("tr-TR") : "—",
    netKg: line.netKg != null ? line.netKg.toLocaleString("tr-TR") : "—",
    kiymet: line.lineTotal != null ? line.lineTotal.toLocaleString("tr-TR") : "—",
    ticariTanim: line.description,
    miktarBirimi: line.unit,
    dovizCinsi: norm.header.currency
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

const INVOICE_TYPES = new Set<DocumentType>(["INVOICE", "E_INVOICE_XML", "EXPORT_INVOICE"]);

export function documentsAreParsing(docs: UploadedDocument[]): boolean {
  return docs.some((doc) => doc.extractionStatus === "PENDING");
}

export function invoiceHasArrived(docs: UploadedDocument[]): boolean {
  return docs.some((doc) => INVOICE_TYPES.has(doc.type) && doc.extractionStatus === "SUCCESS");
}

export function toBeyannameListeItem(d: BackendDeclaration, docs: UploadedDocument[] = []): BeyannameListeItem {
  const norm = mergeNormalizedFromApi(d.normalizedData);
  const op = d.operation;
  const islemLabels: Record<string, string> = {
    ihracat: "İhracat",
    ithalat: "İthalat",
    transit: "Transit",
    antrepo: "Antrepo",
  };
  return {
    id: d._id,
    ref: refFromId(d),
    date: formatDate(op?.receivedAt ?? d.createdAt),
    customer: op?.customerName ?? norm.parties.buyer?.name ?? norm.parties.seller?.name ?? "—",
    customerCity: op?.customerCity ?? norm.parties.buyer?.country ?? norm.parties.seller?.country ?? "—",
    islemTipi: islemLabels[op?.operationType ?? ""] ?? "İhracat",
    status: listeStatusOf(d),
    transportMode: mapTransportMode(op?.transportMode ?? norm.transport.mode),
    lineCount: norm.goodsLines.length,
    docCount: docs.length,
    totalDocCount: docs.length,
    warningCount: d.status === "ERROR" ? 1 : 0,
    parsing: documentsAreParsing(docs),
    invoiceArrived: invoiceHasArrived(docs),
    missingDocuments: op?.missingDocuments ?? [],
    gtipStatus: d.status === "ERROR" ? "uyumsuz" : "uygun",
    assignee: op?.assigneeName ?? "—",
    updatedAt: formatRelative(d.updatedAt ?? d.createdAt),
    approvalStatus: d.approvalWorkflow?.status ?? "FIRST_PENDING",
    requiresSecondApproval: Boolean(d.approvalWorkflow?.requiresSecondApproval),
    approvalNote: d.approvalWorkflow?.note ?? "",
  };
}

export function toBeyannameRecord(d: BackendDeclaration, docs: UploadedDocument[]): BeyannameRecord {
  const norm = mergeNormalizedFromApi(d.normalizedData);
  const op = d.operation;
  const received = docs.filter((doc) => doc.extractionStatus === "SUCCESS").length;
  const formFields = toFormFields(norm);
  const fields = toWritingFields(norm, d.sourceTrace);
  return {
    id: d._id,
    ref: refFromId(d),
    tescilNo: op?.tescilNo ?? (d.generatedXmlPath ? refFromId(d) : "—"),
    customer: op?.customerName ?? norm.parties.buyer?.name ?? norm.parties.seller?.name ?? "—",
    customerId: op?.customerId ?? d.companyId,
    rejim: (norm.evrimHeader?.rejim as string) ?? "10 — İhracat",
    durumLabel: durumLabelOf(d),
    status: STATUS_TO_BEYANNAME[d.status] ?? "taslak",
    transportMode: transportLabel(norm.transport.mode),
    docCount: received,
    lateDocCount: Math.max(0, docs.length - received),
    lineCount: norm.goodsLines.length,
    warningCount: d.status === "ERROR" ? 1 : 0,
    formFields,
    fieldValues: toWritingFieldValues(norm, op),
    fieldMappings: [],
    fields,
    lineItems: toLineItems(norm),
    operationFileStatus: d.operation?.fileStatus ?? "yeni-talep",
    parsing: documentsAreParsing(docs),
    returnNotice: d.operation?.returnNotice ?? "",
    holdNote: d.operation?.holdNote ?? "",
    docs: toDocCheckItems(docs),
    approvalStatus: d.approvalWorkflow?.status ?? "FIRST_PENDING",
    requiresSecondApproval: Boolean(d.approvalWorkflow?.requiresSecondApproval),
    approvalNote: d.approvalWorkflow?.note ?? "",
    approvalHistory: d.approvalWorkflow?.history ?? []
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
  const op = d.operation;
  return {
    id: d._id,
    ref: refFromId(d),
    customer: op?.customerName ?? norm.parties.buyer?.name ?? norm.parties.seller?.name ?? "—",
    status: STATUS_TO_BEYANNAME[d.status] ?? "taslak",
    tescilNo: op?.tescilNo ?? (d.generatedXmlPath ? refFromId(d) : undefined),
    createdAt: d.createdAt ?? new Date().toISOString()
  };
}
