import type { MaterialRecordDoc } from "./materialRecord.model.js";

export interface MaterialRecordDto {
  id: string;
  customerId: string;
  materialNo: string;
  description: string;
  gtipNo: string;
  transactionTypes: string[];
  status: "verified" | "pending" | "rejected";
  source: "manuel" | "fatura";
  pendingUpdate: { materialNo: string; description: string; gtipNo: string } | null;
  rejection: { fields: Array<"materialNo" | "description" | "gtipNo">; note: string } | null;
  updatedAt: string;
}

function formatTrDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${d.getFullYear()}`;
}

export function toMaterialRecordDto(doc: MaterialRecordDoc): MaterialRecordDto {
  return {
    id: String(doc._id),
    customerId: doc.customerId,
    materialNo: doc.materialNo,
    description: doc.description,
    gtipNo: doc.gtipNo,
    transactionTypes: doc.transactionTypes ?? [],
    status: doc.status,
    source: doc.source,
    pendingUpdate: doc.pendingUpdate
      ? {
          materialNo: doc.pendingUpdate.materialNo,
          description: doc.pendingUpdate.description,
          gtipNo: doc.pendingUpdate.gtipNo
        }
      : null,
    rejection: doc.rejection?.fields?.length
      ? { fields: doc.rejection.fields, note: doc.rejection.note ?? "" }
      : null,
    updatedAt: formatTrDate(doc.updatedAt)
  };
}
