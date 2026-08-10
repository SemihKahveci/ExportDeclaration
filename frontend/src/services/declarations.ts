import type {
  Declaration,
  BeyannameRecord, BeyannamePageStats,
  BeyannameListeItem,
  FieldBox, ParsedSourceCard,
  TescilRecord, TescilPageStats,
  KapanicFile, KapanicDoc, KapanicCostItem, KapanicControlItem, KapanicPageStats,
  MtKontrolMapping,
} from '../types';

export const declarationsService = {
  list: async (): Promise<Declaration[]> => {
    const live = await import('./liveApi').then((m) => m.fetchPanelDeclarations());
    return live ?? [];
  },
  get: async (id: string): Promise<Declaration | null> => {
    const live = await import('./liveApi').then((m) => m.fetchPanelDeclarations());
    return live?.find((d) => d.id === id) ?? null;
  },
  create: async (): Promise<Declaration> => {
    return (await import('./liveApi')).apiCreateDeclaration();
  },
};

// ─── Beyanname Yazım & Kontrol screen ────────────────────────────────────────

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

export const BEYANNAME_SOURCE_CARDS: ParsedSourceCard[] = [
  {
    id: 'src-001',
    title: 'Beyanname Taslağı',
    subtitle: 'Sayfa 1 · Genel Bilgiler',
    fields: ['boxSender', 'boxReceiver', 'boxDeclarant', 'boxBeyan', 'boxReference', 'boxDelivery', 'boxCurrency', 'boxGoods', 'boxInvoice', 'boxTaxes'],
    page: 0,
    items: [
      { label: 'İhracatçı',       value: 'Arçelik Global A.Ş.' },
      { label: 'İthalatçı',       value: 'Müller GmbH, München' },
      { label: 'Rejim',           value: '10 — İhracat' },
      { label: 'Teslim Şekli',    value: 'DAP München' },
      { label: 'Kıymet',          value: '48.500,00 EUR' },
    ],
  },
  {
    id: 'src-002',
    title: 'Ekli Liste',
    subtitle: 'Sayfa 2 · Kalem Bilgileri',
    fields: ['boxGtip', 'boxItem', 'boxWeight', 'boxTotals'],
    page: 1,
    items: [
      { label: 'Kalem Sayısı',    value: '4 kalem' },
      { label: 'Toplam Kilo',     value: '1.260 KG' },
      { label: 'Kap Adedi',       value: '20 kap' },
      { label: 'GTİP (1. Kalem)', value: '8501.40.00.00.11' },
    ],
  },
];

export const MT_KONTROL_MAPPINGS: MtKontrolMapping[] = [
  {
    id: 'mtk-001',
    declarationFieldName: 'Gönderici / İhracatçı',
    declarationValue: 'DRINIQUE INC.',
    declarationPage: 0,
    declarationRegion: { x: 5.5, y: 2.2, width: 43.5, height: 8.4 },
    sourceDocumentName: 'Fatura',
    sourceDocumentType: 'document',
    sourceDocumentPage: 0,
    sourceDocumentFieldLabel: 'Satıcı',
    sourceDocumentValue: 'DRINIQUE INC.',
    sourceDocumentRegion: { x: 4.0, y: 6.0, width: 40.0, height: 7.0 },
    status: 'uyumlu',
  },
  {
    id: 'mtk-002',
    declarationFieldName: 'Alıcı / İthalatçı',
    declarationValue: 'ECZACIBAŞİ HOLDİNG A.Ş.',
    declarationPage: 0,
    declarationRegion: { x: 5.5, y: 14.2, width: 43.5, height: 8.8 },
    sourceDocumentName: 'Fatura',
    sourceDocumentType: 'document',
    sourceDocumentPage: 0,
    sourceDocumentFieldLabel: 'Alıcı',
    sourceDocumentValue: 'ECZACIBAŞİ HOLDİNG A.Ş.',
    sourceDocumentRegion: { x: 4.0, y: 17.0, width: 40.0, height: 7.0 },
    status: 'uyumlu',
  },
  {
    id: 'mtk-003',
    declarationFieldName: 'Teslim Şekli',
    declarationValue: 'EXW',
    declarationPage: 0,
    declarationRegion: { x: 27.0, y: 42.1, width: 18.2, height: 5.0 },
    sourceDocumentName: 'Fatura',
    sourceDocumentType: 'document',
    sourceDocumentPage: 0,
    sourceDocumentFieldLabel: 'Teslim Koşulu',
    sourceDocumentValue: 'EXW Phoenix',
    sourceDocumentRegion: { x: 50.0, y: 38.0, width: 35.0, height: 5.5 },
    status: 'uyumlu',
  },
  {
    id: 'mtk-004',
    declarationFieldName: 'Fatura No & Tarihi',
    declarationValue: 'INV23673 / 14.05.2026',
    declarationPage: 0,
    declarationRegion: { x: 5.0, y: 55.7, width: 58.2, height: 8.2 },
    sourceDocumentName: 'Fatura',
    sourceDocumentType: 'document',
    sourceDocumentPage: 0,
    sourceDocumentFieldLabel: 'Fatura No',
    sourceDocumentValue: 'INV23673',
    sourceDocumentRegion: { x: 60.0, y: 6.0, width: 32.0, height: 6.5 },
    status: 'uyumlu',
  },
  {
    id: 'mtk-005',
    declarationFieldName: 'Kap Adedi',
    declarationValue: '2 KAP',
    declarationPage: 0,
    declarationRegion: { x: 45.0, y: 40.0, width: 29.0, height: 8.0 },
    sourceDocumentName: 'Çeki Listesi',
    sourceDocumentType: 'document',
    sourceDocumentPage: 0,
    sourceDocumentFieldLabel: 'Kap Adedi',
    sourceDocumentValue: '2',
    sourceDocumentRegion: { x: 5.0, y: 28.0, width: 25.0, height: 6.0 },
    status: 'uyumlu',
  },
  {
    id: 'mtk-006',
    declarationFieldName: 'Brüt Kilo',
    declarationValue: '366,00 KG',
    declarationPage: 0,
    declarationRegion: { x: 45.0, y: 40.0, width: 29.0, height: 8.0 },
    sourceDocumentName: 'Çeki Listesi',
    sourceDocumentType: 'document',
    sourceDocumentPage: 0,
    sourceDocumentFieldLabel: 'Brüt Ağırlık',
    sourceDocumentValue: '366,00 KG',
    sourceDocumentRegion: { x: 5.0, y: 36.0, width: 30.0, height: 6.0 },
    status: 'uyumlu',
  },
  {
    id: 'mtk-007',
    declarationFieldName: 'GTİP & Kalem Bilgisi',
    declarationValue: '39241000 / PLASTİK BARDAK',
    declarationPage: 1,
    declarationRegion: { x: 13.0, y: 17.0, width: 44.0, height: 8.4 },
    sourceDocumentName: 'GTİP Veri Tabanı',
    sourceDocumentType: 'database_record',
    sourceDocumentPage: 0,
    sourceDocumentFieldLabel: 'GTİP Kodu',
    sourceDocumentValue: '3924.10.00.00 — PLASTİKTEN SOFRA VE MUTFAK EŞYASI',
    sourceDocumentRegion: { x: 0, y: 0, width: 0, height: 0 },
    status: 'uyumlu',
  },
  {
    id: 'mtk-008',
    declarationFieldName: 'Toplam Kıymet',
    declarationValue: '13.194,66 USD',
    declarationPage: 1,
    declarationRegion: { x: 4.0, y: 77.0, width: 90.0, height: 8.5 },
    sourceDocumentName: 'Fatura',
    sourceDocumentType: 'document',
    sourceDocumentPage: 0,
    sourceDocumentFieldLabel: 'Toplam Tutar',
    sourceDocumentValue: '13,194.66 USD',
    sourceDocumentRegion: { x: 60.0, y: 78.0, width: 35.0, height: 6.0 },
    status: 'uyumlu',
  },
];

export const beyannameService = {
  getRecords: async (): Promise<BeyannameRecord[]> => {
    const live = await import('./liveApi').then((m) => m.fetchBeyannameRecords());
    return live ?? [];
  },
  getRecord: async (id: string): Promise<BeyannameRecord | null> => {
    const live = await import('./liveApi').then((m) => m.fetchDeclarationById(id));
    return live;
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
    if (recordId) {
      const live = await import('./liveApi').then((m) => m.fetchSourceCardsById(recordId));
      if (live?.length) return live;
    }
    return [...BEYANNAME_SOURCE_CARDS];
  },
  getMtKontrolMappings: async (): Promise<MtKontrolMapping[]> => {
    return [...MT_KONTROL_MAPPINGS];
  },
};

// ─── Beyanname Liste screen ───────────────────────────────────────────────────

export interface DocumentUploadPayload {
  ref: string;
  customer: string;
  docType: string;
  file: File | null;
  note: string;
}

export const beyannameListeService = {
  getItems: async (): Promise<BeyannameListeItem[]> => {
    const live = await import('./liveApi').then((m) => m.fetchBeyannameListeItems());
    return live ?? [];
  },
  uploadDocument: async (payload: DocumentUploadPayload): Promise<void> => {
    if (!payload.file) return;
    await (await import('./liveApi')).apiUploadByRef(payload.ref, payload.file, payload.docType);
  },
};

// ─── Beyanname Tescil screen ──────────────────────────────────────────────────

export const tescilService = {
  getRecords: async (): Promise<TescilRecord[]> => {
    const live = await import('./liveApi').then((m) => m.fetchTescilRecords());
    return live ?? [];
  },
  getStats: async (): Promise<TescilPageStats> => {
    const records = await tescilService.getRecords();
    const { computeTescilStats } = await import('../api/adapters/operationAdapter');
    return computeTescilStats(records);
  },
};

// ─── Kapanış & Mutabakat screen ───────────────────────────────────────────────

const KAPANIS_DOCS: KapanicDoc[] = [
  { id: 'doc-001', name: 'Beyanname',             required: true,  status: 'Var',        format: 'PDF',            date: '22.05.2026' },
  { id: 'doc-002', name: 'Beyanname Ekli Liste',  required: false, status: 'Var',        format: 'PDF',            date: '22.05.2026' },
  { id: 'doc-003', name: 'Fatura',                required: false, status: 'Var',        format: 'PDF / XML',      date: '14.05.2026' },
  { id: 'doc-004', name: 'Navlun Makbuzu',        required: false, status: 'Var',        format: 'PDF',            date: '21.05.2026' },
  { id: 'doc-005', name: 'Teslim Tesellüm',       required: false, status: 'Bekleniyor', format: 'Mobil Fotoğraf', date: '—' },
  { id: 'doc-006', name: 'Mühürlü Beyanname',     required: false, status: 'Bekleniyor', format: 'JPG / PDF',      date: '—' },
];

const KAPANIS_COSTS: KapanicCostItem[] = [
  { id: 'cost-k-001', label: 'Gümrük Vergisi',         amount: '47.998,85',  currency: 'TL' },
  { id: 'cost-k-002', label: 'Damga Vergisi',           amount: '1.605,80',   currency: 'TL' },
  { id: 'cost-k-003', label: 'KDV Matrah',              amount: '987.659,44', currency: 'TL' },
  { id: 'cost-k-004', label: 'İlave Gümrük Vergisi',    amount: '184.610,96', currency: 'TL' },
  { id: 'cost-k-005', label: 'Depo Gideri',             amount: '15.000,00',  currency: 'TL' },
  { id: 'cost-k-006', label: 'Navlun',                  amount: '118.585,22', currency: 'TL' },
];

const KAPANIS_CONTROLS: KapanicControlItem[] = [
  { id: 'ctl-001', label: 'Beyanname No Kontrolü', subDefault: 'Kontrol bekliyor',          subOk: '26341200AN00121061 eşleşti' },
  { id: 'ctl-002', label: 'Gönderici Kontrolü',    subDefault: 'Kontrol bekliyor',          subOk: 'DRINIQUE eşleşti' },
  { id: 'ctl-003', label: 'Alıcı Kontrolü',        subDefault: 'Kontrol bekliyor',          subOk: 'ACCOLINK eşleşti' },
  { id: 'ctl-004', label: 'Mühür Kontrolü',        subDefault: 'Kontrol bekliyor',          subOk: 'Mühürlü evrak algılandı' },
  { id: 'ctl-005', label: 'Tesellüm Formu',        subDefault: 'Kontrol bekliyor',          subOk: 'Yüklendi ve okundu' },
  { id: 'ctl-006', label: 'Dosya Mutabakatı',      subDefault: 'Operasyon onayı bekliyor',  subOk: 'Operasyon onayı bekliyor' },
];

export const kapanisService = {
  getFiles: async (): Promise<KapanicFile[]> => {
    const live = await import('./liveApi').then((m) => m.fetchKapanisFiles());
    return live ?? [];
  },
  getDocs: async (): Promise<KapanicDoc[]> => {
    return KAPANIS_DOCS.map((d) => ({ ...d }));
  },
  getCosts: async (): Promise<KapanicCostItem[]> => {
    return KAPANIS_COSTS.map((c) => ({ ...c }));
  },
  getControls: async (): Promise<KapanicControlItem[]> => {
    return KAPANIS_CONTROLS.map((c) => ({ ...c }));
  },
  getStats: async (): Promise<KapanicPageStats> => {
    const files = await kapanisService.getFiles();
    const { computeKapanisStats } = await import('../api/adapters/operationAdapter');
    return computeKapanisStats(files);
  },
};
