import type { Declaration as BackendDeclaration } from "@/api/types/declaration.types";
import type { TescilRecord, KapanicFile, TescilPageStats, KapanicPageStats } from "@/types";
import { refFromId } from "@/api/adapters/declarationAdapter";

const TYPE_LABELS: Record<string, string> = {
  ihracat: "İhracat",
  ithalat: "İthalat",
  transit: "Transit",
  antrepo: "Antrepo",
};

function formatTrDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function toTescilRecord(d: BackendDeclaration): TescilRecord {
  const op = d.operation!;
  return {
    id: d._id,
    ref: refFromId(d),
    type: TYPE_LABELS[op.operationType] ?? op.operationType,
    customer: op.customerName,
    tescilNo: op.tescilNo ?? op.declarationNo ?? "—",
    line: (op.line as TescilRecord["line"]) ?? "Mavi",
    status: (op.tescilStatus as TescilRecord["status"]) ?? "started",
    hasSecondNotif: op.hasSecondNotif,
    risk: op.tescilRisk || "—",
    days: op.tescilDays,
    updatedAt: formatTrDateTime(d.updatedAt),
  };
}

export function toKapanicFile(d: BackendDeclaration): KapanicFile {
  const op = d.operation!;
  return {
    id: d._id,
    ref: refFromId(d),
    customer: op.customerName,
    tescilNo: op.tescilNo ?? "—",
    status: (op.kapanisStatus as KapanicFile["status"]) ?? "kontrol-bekliyor",
    tescilDurumu: op.tescilDurumu || "Tamamlandı",
    kapanicDurumu: op.kapanicDurumu || "—",
    mailRecipient: op.mailRecipient || "—",
    mailSubject: op.mailSubject || "—",
    mailBody: op.mailBody || "",
  };
}

export function computeTescilStats(records: TescilRecord[]): TescilPageStats {
  return {
    waiting: records.filter((r) => r.status === "started").length,
    started: records.filter((r) => r.status === "started").length,
    completed: 0,
    yellowRed: records.filter((r) => r.line === "Sarı" || r.line === "Kırmızı").length,
    blueGreenTracking: records.filter((r) => r.line === "Mavi" || r.line === "Yeşil").length,
  };
}

export function computeKapanisStats(files: KapanicFile[]): KapanicPageStats {
  return {
    waiting: files.filter((f) => f.status === "kontrol-bekliyor").length,
    uploaded: files.filter((f) => f.status === "mutabakat-hazir").length,
    reconciled: files.filter((f) => f.status === "kapandi").length,
    warnings: files.filter((f) => f.status === "maliyet-bekliyor").length,
    costPending: files.filter((f) => f.status === "maliyet-bekliyor").length,
  };
}
