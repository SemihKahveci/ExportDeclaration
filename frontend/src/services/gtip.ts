import type {
  GtipEntry, MaterialCustomer, MaterialRecord,
  GtipDeclaration, GtipQueryResult, GtipPageStats,
  CustomerListItem,
} from '../types';
import { parseInvoiceForGtipQuery } from '../api/gtipQueryApi';
import {
  bulkCreateMaterialRecords,
  createMaterialRecord,
  deleteMaterialRecord,
  downloadMaterialRecordTemplate,
  getCustomerRecordCounts,
  importMaterialRecordsExcel,
  listMaterialRecords,
  patchMaterialRecord,
  type CreateMaterialRecordPayload,
  type MaterialRecordImportResult,
} from '../api/materialRecordApi';
import { customersService } from './customers';
import { delay } from './utils';

function parseCityFromMeta(meta?: string): string {
  if (!meta) return '—';
  const part = meta.split(' · ')[0]?.trim();
  return part || '—';
}

function toMaterialCustomer(c: CustomerListItem, recordCount: number): MaterialCustomer {
  return {
    id: c.id,
    name: c.name,
    initials: c.initials,
    city: parseCityFromMeta(c.meta),
    recordCount,
  };
}

const GTIP_ENTRIES: GtipEntry[] = [
  {
    code: '6203.42.31',
    description: 'Erkek pantolonu, pamuklu, çalışma giysisi',
    unit: 'adet',
    taxRate: 12,
    notes: 'Tekstil ürünleri, GTİP tarife pozisyonu',
  },
  {
    code: '8471.30.00',
    description: 'Taşınabilir otomatik bilgi işlem makineleri',
    unit: 'adet',
    taxRate: 0,
    notes: 'BIT ürünleri muafiyeti uygulanır',
  },
  {
    code: '2710.12.25',
    description: 'Kurşunsuz benzin, oktan sayısı 95 ve üzeri',
    unit: 'litre',
    taxRate: 8,
  },
  {
    code: '0901.21.00',
    description: 'Kavranmış kahve, kafeinsiz olmayan',
    unit: 'kg',
    taxRate: 10,
  },
  {
    code: '7204.10.00',
    description: 'Dökme demir atıkları ve hurdaları',
    unit: 'kg',
    taxRate: 0,
  },
];

// ─── GTİP Hazırlık – declaration GTİP control data ───────────────────────────

const GTIP_DECLARATIONS: GtipDeclaration[] = [
  {
    id: 'gd-001',
    ref: 'EXP-4592',
    customer: 'Arçelik Global A.Ş.',
    itemCount: 3,
    statusLabel: 'Uyumsuz kayıt var',
    statusVariant: 'urgent',
    items: [
      {
        lineNo: '1',
        materialNo: 'MLZ-100517',
        materialDesc: 'Çamaşır mak. tahrik motoru',
        systemGtip: '8501.40.00.00.11',
        customerGtip: '8501.40.00.00.11',
        compliance: 'Uyumlu',
        note: 'Sistem ve müşteri GTİP\'i aynı',
      },
      {
        lineNo: '2',
        materialNo: 'MLZ-100701',
        materialDesc: 'Elektronik kontrol kartı',
        systemGtip: '8537.10.91.00.00',
        customerGtip: '8537.10.99.00.00',
        compliance: 'Uyumsuz',
        note: 'Malzeme tanımı sistem GTİP\'i ile farklı',
      },
      {
        lineNo: '3',
        materialNo: 'MLZ-100633',
        materialDesc: 'Buzdolabı kapı contası',
        systemGtip: '3926.90.97.90.18',
        customerGtip: 'Boş',
        compliance: 'Eksik',
        note: 'Müşteri faturada GTİP yazmamış',
      },
    ],
  },
  {
    id: 'gd-002',
    ref: 'EXP-4601',
    customer: 'Ford Otosan',
    itemCount: 2,
    statusLabel: 'Tamamı uyumlu',
    statusVariant: 'ok',
    items: [
      {
        lineNo: '1',
        materialNo: 'MLZ-200118',
        materialDesc: 'Metal bağlantı aparatı',
        systemGtip: '7326.90.98.00.00',
        customerGtip: '7326.90.98.00.00',
        compliance: 'Uyumlu',
        note: 'Kontrol başarılı',
      },
      {
        lineNo: '2',
        materialNo: 'MLZ-200450',
        materialDesc: 'Plastik trim parçası',
        systemGtip: '3926.90.97.90.18',
        customerGtip: '3926.90.97.90.18',
        compliance: 'Uyumlu',
        note: 'Kontrol başarılı',
      },
    ],
  },
  {
    id: 'gd-003',
    ref: 'EXP-4615',
    customer: 'Vestel Ticaret',
    itemCount: 4,
    statusLabel: 'Eksik GTİP var',
    statusVariant: 'warn',
    items: [
      {
        lineNo: '1',
        materialNo: 'MLZ-300112',
        materialDesc: 'Tekstil aksesuarı',
        systemGtip: '5807.10.10.00.00',
        customerGtip: '5807.10.10.00.00',
        compliance: 'Uyumlu',
        note: 'Kontrol başarılı',
      },
      {
        lineNo: '2',
        materialNo: 'MLZ-300145',
        materialDesc: 'Etiket baskılı kumaş',
        systemGtip: '5807.10.90.00.00',
        customerGtip: 'Boş',
        compliance: 'Eksik',
        note: 'GTİP bilgisi faturada yok',
      },
      {
        lineNo: '3',
        materialNo: 'MLZ-300178',
        materialDesc: 'Ambalaj kartonu',
        systemGtip: '4819.10.00.00.00',
        customerGtip: '4819.10.00.00.00',
        compliance: 'Uyumlu',
        note: 'Kontrol başarılı',
      },
      {
        lineNo: '4',
        materialNo: 'MLZ-300201',
        materialDesc: 'Plastik askı',
        systemGtip: '3926.90.97.90.18',
        customerGtip: 'Boş',
        compliance: 'Eksik',
        note: 'GTİP bilgisi faturada yok',
      },
    ],
  },
];

const GTIP_PAGE_STATS: GtipPageStats = {
  pendingRequests:     18,
  declarationControl:  9,
  queryRequests:       6,
  missingGtip:         4,
  mismatchedRecords:   3,
};

// ─── Müşteri GTİP Sorgulama ───────────────────────────────────────────────────

export interface CustomerGtipRequest {
  id: string;
  customer: string;
  source: 'Mail' | 'WhatsApp' | 'Sistem';
  requestStatus: 'Yeni Talep' | 'Operasyon Bekliyor' | 'Tamamlandı';
  manualList: string;
  createdAt: string;
}

const CUSTOMER_GTIP_REQUESTS: CustomerGtipRequest[] = [];

export const gtipService = {
  list: async (): Promise<GtipEntry[]> => {
    await delay(100);
    return [...GTIP_ENTRIES];
  },
  get: async (code: string): Promise<GtipEntry | null> => {
    await delay(60);
    return GTIP_ENTRIES.find((g) => g.code === code) ?? null;
  },
  getCustomers: async (): Promise<MaterialCustomer[]> => {
    const [customers, counts] = await Promise.all([
      customersService.getCustomerList(),
      getCustomerRecordCounts(),
    ]);
    const countMap = new Map(counts.map((c) => [c.customerId, c.recordCount]));
    return customers.map((c) => toMaterialCustomer(c, countMap.get(c.id) ?? 0));
  },
  getRecords: async (customerId: string): Promise<MaterialRecord[]> => {
    if (!customerId) return [];
    return listMaterialRecords(customerId);
  },
  createRecord: async (
    customerId: string,
    record: CreateMaterialRecordPayload
  ): Promise<MaterialRecord> => {
    return createMaterialRecord({ ...record, customerId });
  },
  importRecords: async (
    customerId: string,
    items: CreateMaterialRecordPayload[]
  ): Promise<MaterialRecord[]> => {
    return bulkCreateMaterialRecords(customerId, items);
  },
  approveRecord: async (id: string): Promise<MaterialRecord> => {
    return patchMaterialRecord(id, { status: 'verified' });
  },
  rejectRecord: async (id: string): Promise<void> => {
    return deleteMaterialRecord(id);
  },
  downloadMaterialRecordTemplate: async (): Promise<void> => {
    return downloadMaterialRecordTemplate();
  },
  importMaterialRecordsExcel: async (
    customerId: string,
    file: File
  ): Promise<MaterialRecordImportResult> => {
    return importMaterialRecordsExcel(customerId, file);
  },
  getGtipDeclarations: async (): Promise<GtipDeclaration[]> => {
    await delay(80);
    return GTIP_DECLARATIONS.map((d) => ({
      ...d,
      items: d.items.map((i) => ({ ...i })),
    }));
  },
  getInitialQueryResults: async (): Promise<GtipQueryResult[]> => {
    await delay(80);
    return [];
  },
  getCustomerQueryRequests: async (): Promise<CustomerGtipRequest[]> => {
    await delay(80);
    return CUSTOMER_GTIP_REQUESTS.map((r) => ({ ...r }));
  },
  getCustomerQueryResults: async (): Promise<GtipQueryResult[]> => {
    await delay(80);
    return [];
  },
  parseInvoicePdf: async (file: File): Promise<{
    results: GtipQueryResult[];
    meta: { fileName: string; pdfType: string; itemCount: number };
  }> => {
    const data = await parseInvoiceForGtipQuery(file);
    return {
      meta: {
        fileName: data.fileName,
        pdfType: data.pdfType,
        itemCount: data.itemCount,
      },
      results: data.results.map((r) => ({
        id: r.id,
        materialNo: r.materialNo,
        description: r.description,
        foundGtip: r.foundGtip,
        status: r.status,
        approvalStatus: r.approvalStatus,
      })),
    };
  },
  getPageStats: async (): Promise<GtipPageStats> => {
    await delay(60);
    return { ...GTIP_PAGE_STATS };
  },
};
