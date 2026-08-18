import type {
  Declaration,
  BeyannameRecord, BeyannamePageStats,
  BeyannameListeItem,
  FieldBox, ParsedSourceCard,
  TescilRecord, TescilPageStats,
  KapanicFile, KapanicDoc, KapanicCostItem, KapanicControlItem, KapanicPageStats,
  MtKontrolMapping,
} from '../types';
import {
  apiCreateDeclaration,
  apiUploadByRef,
  fetchBeyannameListeItems,
  fetchBeyannameRecords,
  fetchDeclarationById,
  fetchKapanisFiles,
  fetchPanelDeclarations,
  fetchSourceCardsById,
  fetchTescilRecords,
} from './liveApi';
import { computeKapanisStats, computeTescilStats } from '../api/adapters/operationAdapter';

export const declarationsService = {
  list: async (): Promise<Declaration[]> => {
    const live = await fetchPanelDeclarations();
    return live ?? [];
  },
  get: async (id: string): Promise<Declaration | null> => {
    const live = await fetchPanelDeclarations();
    return live?.find((d) => d.id === id) ?? null;
  },
  create: async (): Promise<Declaration> => {
    return apiCreateDeclaration();
  },
};

/** Beyanname PDF üzerindeki alan kutuları — müşteri/dosya verisi değil, form geometrisi. */
export const BEYANNAME_FIELD_BOXES: FieldBox[] = [
  { id: 'boxSender',    label: 'İhracatçı',         left: 5.5,  top: 2.2,  width: 43.5, height: 8.4,  page: 0 },
  { id: 'boxReceiver',  label: 'İthalatçı',         left: 5.5,  top: 14.2, width: 43.5, height: 8.8,  page: 0 },
  { id: 'boxDeclarant', label: 'Beyan Sahibi',      left: 5.5,  top: 24.2, width: 39.8, height: 7.5,  page: 0 },
  { id: 'boxVehicle',   label: 'Araç',              left: 5.5,  top: 32.2, width: 39.8, height: 6.4,  page: 0 },
  { id: 'boxBeyan',     label: 'Beyan',             left: 49.6, top: 2.0,  width: 12.0, height: 10.0, page: 0 },
  { id: 'boxReference', label: 'Referans',          left: 78.0, top: 8.8,  width: 16.8, height: 5.5,  page: 0 },
  { id: 'boxDelivery',  label: 'Teslim Şekli',      left: 27.0, top: 42.1, width: 18.2, height: 5.0,  page: 0 },
  { id: 'boxCurrency',  label: 'Kur & Kıymet',      left: 45.0, top: 40.0, width: 29.0, height: 8.0,  page: 0 },
  { id: 'boxGoods',     label: 'Eşya Tanımı',       left: 5.0,  top: 43.4, width: 47.5, height: 10.2, page: 0 },
  { id: 'boxInvoice',   label: 'Fatura Bilgileri',  left: 5.0,  top: 55.7, width: 58.2, height: 8.2,  page: 0 },
  { id: 'boxTaxes',     label: 'Vergi / Resim',     left: 5.0,  top: 66.0, width: 88.0, height: 11.0, page: 0 },
  { id: 'boxGtip',      label: 'GTİP',              left: 13.0, top: 17.0, width: 13.5, height: 8.4,  page: 1 },
  { id: 'boxItem',      label: 'Kalem Bilgisi',     left: 26.0, top: 17.0, width: 31.0, height: 8.4,  page: 1 },
  { id: 'boxWeight',    label: 'Ağırlık',           left: 58.0, top: 17.0, width: 20.0, height: 8.4,  page: 1 },
  { id: 'boxTotals',    label: 'Toplamlar',         left: 4.0,  top: 77.0, width: 90.0, height: 8.5,  page: 1 },
];

export const beyannameService = {
  getRecords: async (): Promise<BeyannameRecord[]> => {
    const live = await fetchBeyannameRecords();
    return live ?? [];
  },
  getRecord: async (id: string): Promise<BeyannameRecord | null> => {
    return fetchDeclarationById(id);
  },
  getStats: async (recordId: string): Promise<BeyannamePageStats> => {
    const r = await beyannameService.getRecord(recordId);
    if (!r) return { selectedRecord: 1, receivedDocs: 0, lateDocs: 0, pageCount: 2, warnings: 0 };
    return {
      selectedRecord: 1,
      receivedDocs: r.docCount,
      lateDocs: r.lateDocCount,
      pageCount: 2,
      warnings: r.warningCount,
    };
  },
  getFieldBoxes: async (): Promise<FieldBox[]> => {
    return [...BEYANNAME_FIELD_BOXES];
  },
  getSourceCards: async (recordId?: string): Promise<ParsedSourceCard[]> => {
    if (!recordId) return [];
    const live = await fetchSourceCardsById(recordId);
    return live ?? [];
  },
  getMtKontrolMappings: async (): Promise<MtKontrolMapping[]> => {
    return [];
  },
};

export interface DocumentUploadPayload {
  ref: string;
  customer: string;
  docType: string;
  file: File | null;
  note: string;
}

export const beyannameListeService = {
  getItems: async (): Promise<BeyannameListeItem[]> => {
    const live = await fetchBeyannameListeItems();
    return live ?? [];
  },
  uploadDocument: async (payload: DocumentUploadPayload): Promise<void> => {
    if (!payload.file) return;
    await apiUploadByRef(payload.ref, payload.file, payload.docType);
  },
};

export const tescilService = {
  getRecords: async (): Promise<TescilRecord[]> => {
    const live = await fetchTescilRecords();
    return live ?? [];
  },
  getStats: async (): Promise<TescilPageStats> => {
    const records = await tescilService.getRecords();
    return computeTescilStats(records);
  },
};

export const kapanisService = {
  getFiles: async (): Promise<KapanicFile[]> => {
    const live = await fetchKapanisFiles();
    return live ?? [];
  },
  getDocs: async (): Promise<KapanicDoc[]> => {
    return [];
  },
  getCosts: async (): Promise<KapanicCostItem[]> => {
    return [];
  },
  getControls: async (): Promise<KapanicControlItem[]> => {
    return [];
  },
  getStats: async (): Promise<KapanicPageStats> => {
    const files = await kapanisService.getFiles();
    return computeKapanisStats(files);
  },
};
