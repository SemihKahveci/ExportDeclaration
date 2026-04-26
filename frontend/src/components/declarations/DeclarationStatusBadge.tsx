import type { DeclarationStatus } from "@/types/declaration.types";

const labels: Record<DeclarationStatus, string> = {
  DRAFT: "Taslak",
  READY: "Hazır",
  XML_GENERATED: "XML üretildi",
  ERROR: "Hata"
};

export function DeclarationStatusBadge({ status }: { status: DeclarationStatus }) {
  const cls =
    status === "DRAFT"
      ? "draft"
      : status === "READY"
        ? "ready"
        : status === "XML_GENERATED"
          ? "xml"
          : "err";
  return <span className={`pill ${cls}`}>{labels[status]}</span>;
}
