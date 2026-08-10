import type { Declaration as BackendDeclaration } from "@/api/types/declaration.types";
import type { CustomsFile, FileStatus, TransportMode, OperationType, HatColor } from "@/types";

const STATUS_MAP: Record<string, FileStatus> = {
  DRAFT: "beyanname-yazim",
  READY: "ic-kontrol",
  XML_GENERATED: "tescil",
  ERROR: "evrak-bekleniyor",
};

function mapTransport(mode?: string | null): TransportMode | null {
  if (!mode) return null;
  const m = mode.toLowerCase();
  if (m.includes("deniz") || m.includes("sea")) return "denizyolu";
  if (m.includes("hava") || m.includes("air")) return "havayolu";
  if (m.includes("kara") || m.includes("road")) return "karayolu";
  return "karayolu";
}

function displayRef(d: BackendDeclaration): string {
  return d.operation?.ref ?? `DCL-${d._id.slice(-6).toUpperCase()}`;
}

export function toCustomsFile(d: BackendDeclaration): CustomsFile {
  const op = d.operation;
  const created = op?.receivedAt ?? d.createdAt ?? new Date().toISOString();
  const updated = d.updatedAt ?? created;

  return {
    ref: displayRef(d),
    customer: op?.customerName ?? "—",
    customerCity: op?.customerCity ?? "—",
    status: (op?.fileStatus as FileStatus) ?? STATUS_MAP[d.status] ?? "yeni-talep",
    operationType: (op?.operationType as OperationType) ?? "ihracat",
    isArchived: op?.isArchived ?? false,
    transportMode: mapTransport(op?.transportMode),
    line: (op?.line as HatColor | null) ?? null,
    declarationNo: op?.declarationNo ?? (d.generatedXmlPath ? displayRef(d) : null),
    receivedAt: created,
    closedAt: op?.closedAt ?? undefined,
    lastActivity: op?.lastActivity ?? "Oluşturuldu",
    assignee: op?.assigneeName ? { name: op.assigneeName } : null,
    escalation: op?.escalation ?? d.status === "ERROR",
    missingDocuments: op?.missingDocuments ?? [],
    systemMailHistory: [],
    createdAt: created,
    updatedAt: updated,
  };
}

export function declarationIdFromRef(rows: BackendDeclaration[], ref: string): string | null {
  const match = rows.find((r) => displayRef(r) === ref || r._id === ref);
  return match?._id ?? null;
}
