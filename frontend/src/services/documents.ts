import type {
  Document, DocProcess,
  EvrakFile, EvrakDocRow, EvrakConflictRow, DocPreviewData, EvrakPageStats,
  DocumentFieldRegion, DeclarationFieldMapping,
} from '../types';
import { delay } from './utils';

// ─── Legacy Document list (used by other screens) ────────────────────────────

const MOCK_DOCUMENTS: Document[] = [
  { id: 'doc-001', name: 'Fatura',              type: 'invoice',              status: 'uploaded', fileRef: 'IHR-2024-001', uploadedAt: '2024-05-10T09:00:00Z' },
  { id: 'doc-002', name: 'Paketleme Listesi',   type: 'packing-list',         status: 'uploaded', fileRef: 'IHR-2024-001', uploadedAt: '2024-05-10T09:05:00Z' },
  { id: 'doc-003', name: 'A.TR Dolaşım Belgesi',type: 'atr',                  status: 'missing',  fileRef: 'IHR-2024-002' },
  { id: 'doc-004', name: 'Menşe Şahadetnamesi', type: 'certificate-of-origin',status: 'pending',  fileRef: 'IHR-2024-003' },
  { id: 'doc-005', name: 'Navlun Faturası',     type: 'freight-invoice',      status: 'uploaded', fileRef: 'IHR-2024-003', uploadedAt: '2024-05-09T14:30:00Z' },
];

// ─── Ayarlar screen – document process definitions ────────────────────────────

const DOC_PROCESSES: DocProcess[] = [
  {
    id: 'dp-001',
    name: 'Fatura',
    process: 'GTİP Hazırlık',
    format: 'XML / PDF / JPG',
    parseable: 'Evet',
    testResult: 'Başarılı',
    successRate: '%96',
    supportNote: 'Destek gerekmiyor',
    status: 'Aktif',
  },
  {
    id: 'dp-002',
    name: 'CMR',
    process: 'Evrak Hazırlık',
    format: 'PDF / JPG',
    parseable: 'Evet',
    testResult: 'Kısmi Başarılı',
    successRate: '%78',
    supportNote: 'Kap ve kilo alanları kontrol edilmeli',
    status: 'Aktif',
  },
  {
    id: 'dp-003',
    name: 'Konşimento',
    process: 'Evrak Hazırlık',
    format: 'PDF',
    parseable: 'Evet',
    testResult: 'Test Bekliyor',
    successRate: '—',
    supportNote: 'Örnek dosya bekleniyor',
    status: 'Aktif',
  },
  {
    id: 'dp-004',
    name: 'AWB',
    process: 'Evrak Hazırlık',
    format: 'PDF',
    parseable: 'Evet',
    testResult: 'Başarılı',
    successRate: '%89',
    supportNote: 'Destek gerekmiyor',
    status: 'Aktif',
  },
  {
    id: 'dp-005',
    name: 'Tesellüm Tutanağı',
    process: 'Kapanış',
    format: 'JPG / PNG',
    parseable: 'Hayır',
    testResult: 'Başarısız',
    successRate: '—',
    supportNote: 'Manuel kontrol ile ilerler',
    status: 'Aktif',
  },
];

export const documentsService = {
  list: async (): Promise<Document[]> => {
    await delay(100);
    return [...MOCK_DOCUMENTS];
  },
  get: async (id: string): Promise<Document | null> => {
    await delay(60);
    return MOCK_DOCUMENTS.find((d) => d.id === id) ?? null;
  },
  getDocProcesses: async (): Promise<DocProcess[]> => {
    await delay(80);
    return DOC_PROCESSES.map((d) => ({ ...d }));
  },
};

// ─── Evrak Hazırlık screen data ───────────────────────────────────────────────

const EVRAK_FILES: EvrakFile[] = [
  { id: 'ef-001', ref: 'EXP-4592', customer: 'Arçelik Global A.Ş.', meta: '2 eksik · 3 uyumsuz', allReady: false },
  { id: 'ef-002', ref: 'EXP-4601', customer: 'Ford Otosan',          meta: 'Tüm evraklar geldi',            allReady: true  },
  { id: 'ef-003', ref: 'EXP-4615', customer: 'Vestel Ticaret',       meta: '1 eksik · kontrol bekliyor',    allReady: false },
  { id: 'ef-004', ref: 'EXP-4631', customer: 'Şişecam',              meta: 'Uyumsuzluk yok',                allReady: true  },
];

const EVRAK_DOCS: Record<string, EvrakDocRow[]> = {
  'ef-001': [
    { id: 'd1', name: 'Fatura',       required: 'Evet',     status: 'Geldi',    source: 'Mail / XML',  lastAction: '16.05.2026 10:12', note: 'GTİP ve malzeme alanları okundu' },
    { id: 'd2', name: 'Çeki Listesi', required: 'Evet',     status: 'Geldi',    source: 'Mail / PDF',  lastAction: '16.05.2026 10:18', note: 'Kap ve kilo okundu' },
    { id: 'd3', name: 'CMR',          required: 'Evet',     status: 'Geldi',    source: 'Mail / PDF',  lastAction: '16.05.2026 11:05', note: 'Kap ve kilo fatura ile farklı' },
    { id: 'd4', name: 'ATR',          required: 'Koşullu',  status: 'Eksik',    source: '—',           lastAction: '—',               note: 'Bildirimli işlemde gerekebilir' },
    { id: 'd5', name: 'Konşimento',   required: 'Hayır',    status: 'Eksik',    source: '—',           lastAction: '—',               note: 'Karayolu olduğu için zorunlu değil' },
  ],
  'ef-002': [
    { id: 'd1', name: 'Fatura',       required: 'Evet',     status: 'Geldi',    source: 'Mail / XML',  lastAction: '17.05.2026 09:00', note: 'Alanlar başarıyla okundu' },
    { id: 'd2', name: 'Çeki Listesi', required: 'Evet',     status: 'Geldi',    source: 'Mail / PDF',  lastAction: '17.05.2026 09:05', note: 'Kap ve kilo okundu' },
    { id: 'd3', name: 'CMR',          required: 'Evet',     status: 'Geldi',    source: 'Mail / PDF',  lastAction: '17.05.2026 09:30', note: 'Veriler fatura ile uyumlu' },
    { id: 'd4', name: 'ATR',          required: 'Koşullu',  status: 'Geldi',    source: 'Mail / PDF',  lastAction: '17.05.2026 09:45', note: 'Gönderildi, onaylandı' },
  ],
  'ef-003': [
    { id: 'd1', name: 'Fatura',       required: 'Evet',     status: 'Geldi',    source: 'Mail / XML',  lastAction: '18.05.2026 08:40', note: 'Alanlar okundu' },
    { id: 'd2', name: 'Çeki Listesi', required: 'Evet',     status: 'Geldi',    source: 'Mail / PDF',  lastAction: '18.05.2026 08:45', note: 'Kap ve kilo okundu' },
    { id: 'd3', name: 'CMR',          required: 'Evet',     status: 'Eksik',    source: '—',           lastAction: '—',               note: 'Müşteri bekleniyor' },
    { id: 'd4', name: 'ATR',          required: 'Koşullu',  status: 'Koşullu',  source: '—',           lastAction: '—',               note: 'Gerekirse istenecek' },
  ],
  'ef-004': [
    { id: 'd1', name: 'Fatura',       required: 'Evet',     status: 'Geldi',    source: 'Mail / XML',  lastAction: '19.05.2026 10:00', note: 'Alanlar okundu' },
    { id: 'd2', name: 'Çeki Listesi', required: 'Evet',     status: 'Geldi',    source: 'Mail / PDF',  lastAction: '19.05.2026 10:05', note: 'Kap ve kilo okundu' },
    { id: 'd3', name: 'CMR',          required: 'Evet',     status: 'Geldi',    source: 'Mail / PDF',  lastAction: '19.05.2026 10:20', note: 'Veriler uyumlu' },
  ],
};

const EVRAK_CONFLICTS: Record<string, EvrakConflictRow[]> = {
  'ef-001': [
    { id: 'c1', type: 'Eksik Evrak',        docOrField: 'ATR',         source1: '—',      value1: 'Gelmedi',   source2: '—',            value2: '—',        suggestedAction: 'Müşteriden evrak iste veya eksik evrakla devam et' },
    { id: 'c2', type: 'Veri Uyumsuzluğu',   docOrField: 'Kap',         source1: 'Fatura', value1: '18',        source2: 'CMR',          value2: '20',       suggestedAction: 'Müşteriden doğru evrak iste' },
    { id: 'c3', type: 'Veri Uyumsuzluğu',   docOrField: 'Kilo',        source1: 'Fatura', value1: '1240 KG',   source2: 'CMR',          value2: '1260 KG',  suggestedAction: 'Müşteriden doğru evrak iste' },
    { id: 'c4', type: 'Veri Uyumsuzluğu',   docOrField: 'Teslim Yeri', source1: 'Fatura', value1: 'Hungary',   source2: 'Mail Gövdesi', value2: 'Germany',  suggestedAction: 'Operasyon kontrolü' },
  ],
  'ef-002': [],
  'ef-003': [
    { id: 'c1', type: 'Eksik Evrak',        docOrField: 'CMR',         source1: '—',      value1: 'Gelmedi',   source2: '—',            value2: '—',        suggestedAction: 'Müşteriden CMR talep et' },
  ],
  'ef-004': [],
};

const DOC_PREVIEW: Record<string, DocPreviewData> = {
  'Fatura':       { docName: 'Fatura',       kap: '18',  kilo: '1240 KG', gtip: '8501.40.00.00.11', parseSource: 'Kaynak: e-Fatura XML · Parse güveni %96', status: 'Geldi', origin: 'Mail / XML',  lastAction: '16.05.2026 10:12' },
  'CMR':          { docName: 'CMR',           kap: '20',  kilo: '1260 KG', gtip: '—',                parseSource: 'Kaynak: PDF · Parse güveni %82',           status: 'Geldi', origin: 'Mail / PDF',  lastAction: '16.05.2026 11:05' },
  'Çeki Listesi': { docName: 'Çeki Listesi',  kap: '18',  kilo: '1240 KG', gtip: '—',                parseSource: 'Kaynak: PDF · Parse güveni %88',           status: 'Geldi', origin: 'Mail / PDF',  lastAction: '16.05.2026 10:18' },
  'ATR':          { docName: 'ATR',           kap: '—',   kilo: '—',       gtip: '—',                parseSource: 'Kaynak yok · Evrak gelmedi',               status: 'Eksik', origin: '—',           lastAction: '—' },
  'Konşimento':   { docName: 'Konşimento',    kap: '—',   kilo: '—',       gtip: '—',                parseSource: 'Karayolu dosyası için zorunlu değil',      status: 'Eksik', origin: '—',           lastAction: '—' },
};

const EVRAK_STATS: EvrakPageStats = {
  required: 7, received: 5, missing: 2, fieldConflicts: 3, parsedFields: 18,
};

export const DOCUMENT_TYPE_OPTIONS: string[] = [
  'Fatura',
  'CMR',
  'Konşimento',
  'AWB',
  'Çeki Listesi',
  'A.TR Dolaşım Belgesi',
  'Menşe Şahadetnamesi',
  'Paketleme Listesi',
  'Tesellüm Tutanağı',
  'Sağlık Sertifikası',
  'Teknik Doküman',
  'CE Sertifikası',
  'Navlun Makbuzu',
  'Beyanname Taslağı',
];

export const evrakService = {
  getFiles: async (): Promise<EvrakFile[]> => {
    const live = await import('./liveApi').then((m) => m.fetchEvrakFiles());
    if (live?.length) return live;
    await delay(80);
    return EVRAK_FILES.map((f) => ({ ...f }));
  },
  getDocs: async (fileId: string): Promise<EvrakDocRow[]> => {
    const live = await import('./liveApi').then((m) => m.fetchEvrakDocs(fileId));
    if (live?.length) return live;
    await delay(60);
    return (EVRAK_DOCS[fileId] ?? []).map((d) => ({ ...d }));
  },
  getConflicts: async (fileId: string): Promise<EvrakConflictRow[]> => {
    await delay(60);
    return (EVRAK_CONFLICTS[fileId] ?? []).map((c) => ({ ...c }));
  },
  getPreview: async (docName: string): Promise<DocPreviewData | null> => {
    await delay(40);
    return DOC_PREVIEW[docName] ?? null;
  },
  getStats: async (): Promise<EvrakPageStats> => {
    await delay(60);
    return { ...EVRAK_STATS };
  },
};

// ─── Document field regions ───────────────────────────────────────────────────
// Each entry describes a selectable field region on a source document preview.
// Coordinates are percentages of the schematic document area (width × height).

export const DOCUMENT_FIELD_REGIONS: DocumentFieldRegion[] = [
  // Fatura (Invoice)
  { id: 'ftr-gonderici',      documentType: 'Fatura',       label: 'Gönderici / Satıcı',       x: 4,  y: 8,  width: 42, height: 9  },
  { id: 'ftr-alici',          documentType: 'Fatura',       label: 'Alıcı / Muhatap',           x: 52, y: 8,  width: 44, height: 9  },
  { id: 'ftr-fatura-no',      documentType: 'Fatura',       label: 'Fatura No',                 x: 52, y: 20, width: 22, height: 5  },
  { id: 'ftr-fatura-tarihi',  documentType: 'Fatura',       label: 'Fatura Tarihi',             x: 76, y: 20, width: 20, height: 5  },
  { id: 'ftr-doviz',          documentType: 'Fatura',       label: 'Döviz Cinsi',               x: 52, y: 27, width: 20, height: 5  },
  { id: 'ftr-toplam',         documentType: 'Fatura',       label: 'Toplam Tutar',              x: 74, y: 27, width: 22, height: 5  },
  { id: 'ftr-odeme',          documentType: 'Fatura',       label: 'Ödeme Şekli',               x: 4,  y: 27, width: 26, height: 5  },
  { id: 'ftr-teslim',         documentType: 'Fatura',       label: 'Teslim Şekli',              x: 32, y: 27, width: 18, height: 5  },
  { id: 'ftr-mal-tanimi',     documentType: 'Fatura',       label: 'Mal Tanımı',                x: 4,  y: 55, width: 60, height: 7  },
  { id: 'ftr-miktar',         documentType: 'Fatura',       label: 'Miktar',                    x: 66, y: 55, width: 14, height: 7  },
  { id: 'ftr-navlun',         documentType: 'Fatura',       label: 'Navlun',                    x: 4,  y: 80, width: 28, height: 5  },
  { id: 'ftr-sigorta',        documentType: 'Fatura',       label: 'Sigorta',                   x: 34, y: 80, width: 28, height: 5  },

  // CMR
  { id: 'cmr-gonderici',      documentType: 'CMR',          label: 'Gönderici',                 x: 4,  y: 6,  width: 44, height: 8  },
  { id: 'cmr-alici',          documentType: 'CMR',          label: 'Alıcı',                     x: 4,  y: 17, width: 44, height: 8  },
  { id: 'cmr-teslimat',       documentType: 'CMR',          label: 'Teslimat Yeri',             x: 4,  y: 28, width: 44, height: 8  },
  { id: 'cmr-plaka',          documentType: 'CMR',          label: 'Plaka / Araç No',           x: 52, y: 6,  width: 44, height: 8  },
  { id: 'cmr-kap',            documentType: 'CMR',          label: 'Kap Adedi',                 x: 4,  y: 50, width: 22, height: 7  },
  { id: 'cmr-brut',           documentType: 'CMR',          label: 'Brüt Kilo',                 x: 28, y: 50, width: 22, height: 7  },
  { id: 'cmr-cmr-no',         documentType: 'CMR',          label: 'CMR No',                    x: 52, y: 17, width: 44, height: 8  },
  { id: 'cmr-tasinan',        documentType: 'CMR',          label: 'Taşınan Mal',               x: 4,  y: 60, width: 60, height: 8  },

  // Çeki Listesi (Packing List)
  { id: 'ck-kap-adedi',       documentType: 'Çeki Listesi', label: 'Kap Adedi',                 x: 4,  y: 20, width: 28, height: 7  },
  { id: 'ck-kap-cinsi',       documentType: 'Çeki Listesi', label: 'Kap Cinsi',                 x: 34, y: 20, width: 28, height: 7  },
  { id: 'ck-brut',            documentType: 'Çeki Listesi', label: 'Brüt Kilo',                 x: 4,  y: 30, width: 28, height: 7  },
  { id: 'ck-net',             documentType: 'Çeki Listesi', label: 'Net Kilo',                  x: 34, y: 30, width: 28, height: 7  },
  { id: 'ck-mal',             documentType: 'Çeki Listesi', label: 'Mal Tanımı',                x: 4,  y: 50, width: 90, height: 8  },

  // Konşimento (B/L)
  { id: 'bl-gonderici',       documentType: 'Konşimento',   label: 'Gönderici / Yükleyen',      x: 4,  y: 8,  width: 44, height: 9  },
  { id: 'bl-alici',           documentType: 'Konşimento',   label: 'Alıcı',                     x: 4,  y: 20, width: 44, height: 9  },
  { id: 'bl-bl-no',           documentType: 'Konşimento',   label: 'Konşimento No',             x: 52, y: 8,  width: 44, height: 8  },
  { id: 'bl-liman-cikis',     documentType: 'Konşimento',   label: 'Yükleme Limanı',            x: 4,  y: 45, width: 44, height: 7  },
  { id: 'bl-liman-varis',     documentType: 'Konşimento',   label: 'Tahliye Limanı',            x: 52, y: 45, width: 44, height: 7  },
  { id: 'bl-konteyner',       documentType: 'Konşimento',   label: 'Konteyner No',              x: 4,  y: 60, width: 44, height: 7  },
];

// ─── Per-record default mappings ──────────────────────────────────────────────

const RECORD_FIELD_MAPPINGS: Record<string, DeclarationFieldMapping[]> = {
  'byn-001': [
    { declarationFieldName: 'Gönderici / İhracatçı Ünvanı',  linkedDocumentType: 'Fatura',       documentFieldRegionId: 'ftr-gonderici',     documentFieldLabel: 'Gönderici / Satıcı',   status: 'uyumlu'     },
    { declarationFieldName: 'Gönderici / İhracatçı Adresi',  linkedDocumentType: 'Fatura',       documentFieldRegionId: 'ftr-gonderici',     documentFieldLabel: 'Gönderici / Satıcı',   status: 'uyumlu'     },
    { declarationFieldName: 'Alıcı / İthalatçı Ünvanı',      linkedDocumentType: 'Fatura',       documentFieldRegionId: 'ftr-alici',         documentFieldLabel: 'Alıcı / Muhatap',      status: 'uyumlu'     },
    { declarationFieldName: 'Alıcı / İthalatçı Adresi',      linkedDocumentType: 'Fatura',       documentFieldRegionId: 'ftr-alici',         documentFieldLabel: 'Alıcı / Muhatap',      status: 'uyumlu'     },
    { declarationFieldName: 'Fatura No',                      linkedDocumentType: 'Fatura',       documentFieldRegionId: 'ftr-fatura-no',     documentFieldLabel: 'Fatura No',            status: 'uyumlu'     },
    { declarationFieldName: 'Fatura Tarihi',                  linkedDocumentType: 'Fatura',       documentFieldRegionId: 'ftr-fatura-tarihi', documentFieldLabel: 'Fatura Tarihi',        status: 'uyumlu'     },
    { declarationFieldName: 'Döviz Cinsi',                    linkedDocumentType: 'Fatura',       documentFieldRegionId: 'ftr-doviz',         documentFieldLabel: 'Döviz Cinsi',          status: 'uyumlu'     },
    { declarationFieldName: 'Toplam Fatura Bedeli',           linkedDocumentType: 'Fatura',       documentFieldRegionId: 'ftr-toplam',        documentFieldLabel: 'Toplam Tutar',         status: 'uyumlu'     },
    { declarationFieldName: 'Teslim Şekli',                   linkedDocumentType: 'Fatura',       documentFieldRegionId: 'ftr-teslim',        documentFieldLabel: 'Teslim Şekli',         status: 'uyumlu'     },
    { declarationFieldName: 'Navlun',                         linkedDocumentType: 'Fatura',       documentFieldRegionId: 'ftr-navlun',        documentFieldLabel: 'Navlun',               status: 'uyumlu'     },
    { declarationFieldName: 'Kap Adedi',                      linkedDocumentType: 'Çeki Listesi', documentFieldRegionId: 'ck-kap-adedi',      documentFieldLabel: 'Kap Adedi',            status: 'uyumlu'     },
    { declarationFieldName: 'Kap Cinsi',                      linkedDocumentType: 'Çeki Listesi', documentFieldRegionId: 'ck-kap-cinsi',      documentFieldLabel: 'Kap Cinsi',            status: 'uyumlu'     },
    { declarationFieldName: 'Brüt Kilo',                      linkedDocumentType: 'Çeki Listesi', documentFieldRegionId: 'ck-brut',           documentFieldLabel: 'Brüt Kilo',            status: 'uyumlu'     },
    { declarationFieldName: 'Net Kilo',                       linkedDocumentType: 'Çeki Listesi', documentFieldRegionId: 'ck-net',            documentFieldLabel: 'Net Kilo',             status: 'uyumlu'     },
    { declarationFieldName: 'Plaka',                          linkedDocumentType: 'CMR',          documentFieldRegionId: 'cmr-plaka',         documentFieldLabel: 'Plaka / Araç No',      status: 'uyumlu'     },
  ],
  'byn-002': [
    { declarationFieldName: 'Gönderici / İhracatçı Ünvanı',  linkedDocumentType: 'Fatura',       documentFieldRegionId: 'ftr-gonderici',     documentFieldLabel: 'Gönderici / Satıcı',   status: 'uyumlu'     },
    { declarationFieldName: 'Alıcı / İthalatçı Ünvanı',      linkedDocumentType: 'Fatura',       documentFieldRegionId: 'ftr-alici',         documentFieldLabel: 'Alıcı / Muhatap',      status: 'uyumlu'     },
    { declarationFieldName: 'Fatura No',                      linkedDocumentType: 'Fatura',       documentFieldRegionId: 'ftr-fatura-no',     documentFieldLabel: 'Fatura No',            status: 'uyumlu'     },
    { declarationFieldName: 'CMR No',                         linkedDocumentType: 'CMR',          documentFieldRegionId: 'cmr-cmr-no',        documentFieldLabel: 'CMR No',               status: 'uyumlu'     },
    { declarationFieldName: 'Kap Adedi',                      linkedDocumentType: 'CMR',          documentFieldRegionId: 'cmr-kap',           documentFieldLabel: 'Kap Adedi',            status: 'uyumsuz'    },
    { declarationFieldName: 'Brüt Kilo',                      linkedDocumentType: 'CMR',          documentFieldRegionId: 'cmr-brut',          documentFieldLabel: 'Brüt Kilo',            status: 'uyumsuz'    },
    { declarationFieldName: 'Plaka',                          linkedDocumentType: 'CMR',          documentFieldRegionId: 'cmr-plaka',         documentFieldLabel: 'Plaka / Araç No',      status: 'uyumlu'     },
  ],
  'byn-003': [
    { declarationFieldName: 'Gönderici / İhracatçı Ünvanı',  linkedDocumentType: 'Fatura',       documentFieldRegionId: 'ftr-gonderici',     documentFieldLabel: 'Gönderici / Satıcı',   status: 'uyumlu'     },
    { declarationFieldName: 'Alıcı / İthalatçı Ünvanı',      linkedDocumentType: 'Fatura',       documentFieldRegionId: 'ftr-alici',         documentFieldLabel: 'Alıcı / Muhatap',      status: 'uyumlu'     },
    { declarationFieldName: 'Toplam Fatura Bedeli',           linkedDocumentType: 'Fatura',       documentFieldRegionId: 'ftr-toplam',        documentFieldLabel: 'Toplam Tutar',         status: 'uyumlu'     },
    { declarationFieldName: 'Konşimento No',                  linkedDocumentType: 'Konşimento',   documentFieldRegionId: 'bl-bl-no',          documentFieldLabel: 'Konşimento No',        status: 'uyumlu'     },
    { declarationFieldName: 'Kap Adedi',                      linkedDocumentType: 'Çeki Listesi', documentFieldRegionId: 'ck-kap-adedi',      documentFieldLabel: 'Kap Adedi',            status: 'uyumlu'     },
    { declarationFieldName: 'Brüt Kilo',                      linkedDocumentType: 'Çeki Listesi', documentFieldRegionId: 'ck-brut',           documentFieldLabel: 'Brüt Kilo',            status: 'uyumlu'     },
  ],
};

export const documentFieldMappingService = {
  getRegions: async (documentType: string): Promise<DocumentFieldRegion[]> => {
    await delay(30);
    return DOCUMENT_FIELD_REGIONS.filter((r) => r.documentType === documentType);
  },
  getAllRegions: async (): Promise<DocumentFieldRegion[]> => {
    await delay(30);
    return [...DOCUMENT_FIELD_REGIONS];
  },
  getMappings: async (recordId: string): Promise<DeclarationFieldMapping[]> => {
    await delay(50);
    return (RECORD_FIELD_MAPPINGS[recordId] ?? []).map((m) => ({ ...m }));
  },
};

