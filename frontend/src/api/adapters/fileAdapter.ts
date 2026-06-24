import type { Declaration as BackendDeclaration } from "@/api/types/declaration.types";
import { mergeNormalizedFromApi } from "@/api/types/document.types";
import type { CustomsFile, FileStatus, TransportMode } from "@/types";
import { refFromId } from "@/api/adapters/declarationAdapter";

const STATUS_MAP: Record<string, FileStatus> = {
  DRAFT: "beyanname-yazim",
  READY: "ic-kontrol",
  XML_GENERATED: "tescil",
  ERROR: "evrak-bekleniyor"
};

function mapTransport(mode?: string): TransportMode | null {
  if (!mode) return null;
  const m = mode.toLowerCase();
  if (m.includes("deniz") || m.includes("sea")) return "denizyolu";
  if (m.includes("hava") || m.includes("air")) return "havayolu";
  return "karayolu";
}

export function toCustomsFile(d: BackendDeclaration): CustomsFile {
  const norm = mergeNormalizedFromApi(d.normalizedData);
  const ref = refFromId(d._id);
  const created = d.createdAt ?? new Date().toISOString();
  return {
    ref,
    customer: norm.parties.buyer?.name ?? norm.parties.seller?.name ?? "—",
    customerCity: norm.parties.buyer?.country ?? norm.parties.seller?.country ?? "—",
    status: STATUS_MAP[d.status] ?? "yeni-talep",
    operationType: "ihracat",
    isArchived: false,
    transportMode: mapTransport(norm.transport.mode),
    line: null,
    declarationNo: d.generatedXmlPath ? ref : null,
    receivedAt: created,
    lastActivity: d.updatedAt ? `Güncellendi: ${new Date(d.updatedAt).toLocaleString("tr-TR")}` : "Oluşturuldu",
    assignee: null,
    escalation: d.status === "ERROR",
    missingDocuments: [],
    systemMailHistory: [],
    createdAt: created,
    updatedAt: d.updatedAt ?? created
  };
}
