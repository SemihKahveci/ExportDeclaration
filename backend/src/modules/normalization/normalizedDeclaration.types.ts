import type { DocumentTypeValue } from "../../common/enums/documentType.js";

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

/** Evrim şeması netleşince doldurulacak başlık alanları (doküman §2: beyan tipi, rejim, gümrük idaresi vb.). */
export interface EvrimHeaderDraft {
  declarationType?: string;
  exportType?: string;
  customsOffice?: string;
  regimeCode?: string;
  fileReference?: string;
  declarationDate?: string;
  [key: string]: unknown;
}

export interface NormalizedDeclaration {
  header: {
    invoiceNo?: string;
    invoiceDate?: string;
    currency?: string;
    totalAmount?: number;
  };
  evrimHeader?: EvrimHeaderDraft;
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

export interface ExtractedSource {
  type: DocumentTypeValue;
  data: Record<string, unknown>;
}

export interface FieldResolution<T = unknown> {
  value: T | null;
  sourceType: DocumentTypeValue | null;
}
