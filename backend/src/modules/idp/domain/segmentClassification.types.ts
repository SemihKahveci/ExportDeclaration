export const ClassifiedDocumentType = {
  INVOICE: "INVOICE",
  PACKING_LIST: "PACKING_LIST",
  ATR: "ATR",
  EUR1: "EUR1",
  CERTIFICATE_OF_ORIGIN: "CERTIFICATE_OF_ORIGIN",
  BILL_OF_LADING: "BILL_OF_LADING",
  CMR: "CMR",
  UNKNOWN: "UNKNOWN"
} as const;

export type ClassifiedDocumentTypeValue =
  (typeof ClassifiedDocumentType)[keyof typeof ClassifiedDocumentType];

export interface SegmentClassification {
  segmentId: string;
  documentType: ClassifiedDocumentTypeValue;
  confidence: number;
  method: "DETERMINISTIC";
  evidence: string[];
}
