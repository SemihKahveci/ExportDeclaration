import type { MaterialRecordDoc } from "./materialRecord.model.js";

export interface MaterialRecordDto {
  id: string;
  customerId: string;
  materialNo: string;
  description: string;
  gtipNo: string;
  transactionTypes: string[];
  status: "verified" | "pending";
  source: "manuel" | "fatura";
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
    updatedAt: formatTrDate(doc.updatedAt)
  };
}
