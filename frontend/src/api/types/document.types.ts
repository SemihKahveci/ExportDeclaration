export type DocumentType =
  | "INVOICE"
  | "E_INVOICE_XML"
  | "EXPORT_INVOICE"
  | "PACKING_LIST"
  | "PROFORMA"
  | "BILL_OF_LADING_INSTRUCTION"
  | "OTHER";

export type ExtractionStatus = "PENDING" | "SUCCESS" | "FAILED" | "MANUAL_REQUIRED";

export interface Party {
  name?: string;
  taxNo?: string;
  address?: string;
  country?: string;
}

export interface GoodsLine {
  lineNo: number;
  hsCode?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  lineTotal?: number;
  origin?: string;
  grossKg?: number;
  netKg?: number;
}

export interface NormalizedDeclaration {
  header: {
    invoiceNo?: string;
    invoiceDate?: string;
    currency?: string;
    totalAmount?: number;
  };
  evrimHeader?: Record<string, unknown>;
  parties: {
    seller?: Party;
    buyer?: Party;
    notify?: Party;
  };
  trade: {
    deliveryTerm?: string;
    paymentType?: string;
    origin?: string;
  };
  transport: {
    mode?: string;
  };
  packageInfo: {
    totalPackage?: number;
    packageType?: string;
    grossKg?: number;
    netKg?: number;
  };
  goodsLines: GoodsLine[];
}

export function emptyNormalized(): NormalizedDeclaration {
  return {
    header: {},
    parties: {},
    trade: {},
    transport: {},
    packageInfo: {},
    goodsLines: []
  };
}

/** API'den gelen kısmi / eski şekil veriyi forma güvenle aktarır. */
export function mergeNormalizedFromApi(raw: unknown): NormalizedDeclaration {
  const e = emptyNormalized();
  if (!raw || typeof raw !== "object") return e;
  const n = raw as Partial<NormalizedDeclaration>;
  const gl = Array.isArray(n.goodsLines)
    ? n.goodsLines.map((row, idx) => ({
        lineNo: typeof row.lineNo === "number" ? row.lineNo : idx + 1,
        hsCode: row.hsCode,
        description: row.description,
        quantity: row.quantity,
        unit: row.unit,
        unitPrice: row.unitPrice,
        lineTotal: row.lineTotal,
        origin: row.origin,
        grossKg: row.grossKg,
        netKg: row.netKg
      }))
    : e.goodsLines;
  return {
    header: { ...e.header, ...n.header },
    evrimHeader: n.evrimHeader ?? e.evrimHeader,
    parties: {
      seller: { ...e.parties.seller, ...n.parties?.seller },
      buyer: { ...e.parties.buyer, ...n.parties?.buyer },
      notify: { ...e.parties.notify, ...n.parties?.notify }
    },
    trade: { ...e.trade, ...n.trade },
    transport: { ...e.transport, ...n.transport },
    packageInfo: { ...e.packageInfo, ...n.packageInfo },
    goodsLines: gl
  };
}

export interface UploadedDocument {
  _id: string;
  companyId: string;
  declarationId: string;
  type: DocumentType;
  fileName?: string;
  filePath?: string;
  mimeType?: string;
  extractionStatus: ExtractionStatus;
  extractedData?: unknown;
  parseErrors?: string[];
  createdAt?: string;
  updatedAt?: string;
}
