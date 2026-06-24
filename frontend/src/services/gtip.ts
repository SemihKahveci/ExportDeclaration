import type {
  GtipEntry, MaterialCustomer, MaterialRecord,
  GtipDeclaration, GtipQueryResult, GtipPageStats,
} from '../types';
import { parseInvoiceForGtipQuery } from '../api/gtipQueryApi';
import { delay } from './utils';

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

const CUSTOMERS: MaterialCustomer[] = [
  { id: 'arcelik',    name: 'Arçelik A.Ş.',    initials: 'AR', city: 'İstanbul',  recordCount: 124 },
  { id: 'vestel',     name: 'Vestel Ticaret',   initials: 'VE', city: 'Manisa',    recordCount: 89  },
  { id: 'bsh',        name: 'BSH Ev Aletleri',  initials: 'BS', city: 'Çerkezköy', recordCount: 67  },
  { id: 'ford',       name: 'Ford Otosan',      initials: 'FO', city: 'Kocaeli',   recordCount: 156 },
  { id: 'sisecam',    name: 'Şişecam',          initials: 'Şİ', city: 'Mersin',    recordCount: 43  },
  { id: 'eczacibasi', name: 'Eczacıbaşı',       initials: 'EC', city: 'İstanbul',  recordCount: 58  },
  { id: 'tofas',      name: 'Tofaş Türk',       initials: 'TO', city: 'Bursa',     recordCount: 201 },
  { id: 'aygaz',      name: 'Aygaz',            initials: 'AY', city: 'Kocaeli',   recordCount: 31  },
  { id: 'kordsa',     name: 'Kordsa',           initials: 'KO', city: 'İzmit',     recordCount: 22  },
  { id: 'brisa',      name: 'Brisa',            initials: 'BR', city: 'İzmit',     recordCount: 38  },
];

const RECORDS: MaterialRecord[] = [
  {
    id: '1',
    materialNo: 'MLZ-100482',
    description: 'Hermetik kompresör 1/4 HP',
    gtipNo: '8414.30.20.00.00',
    transactionTypes: ['ithalat', 'ihracat', 'transit', 'antrepo'],
    status: 'verified',
    source: 'manuel',
    updatedAt: '12.05.2026',
    customerId: 'arcelik',
  },
  {
    id: '2',
    materialNo: 'MLZ-100517',
    description: 'Çamaşır mak. tahrik motoru',
    gtipNo: '8501.40.00.00.11',
    transactionTypes: ['ihracat'],
    status: 'verified',
    source: 'fatura',
    updatedAt: '19.05.2026',
    customerId: 'arcelik',
  },
  {
    id: '3',
    materialNo: 'MLZ-100701',
    description: 'Elektronik kontrol kartı',
    gtipNo: '8537.10.99.00.00',
    transactionTypes: ['ithalat', 'ihracat', 'transit', 'antrepo'],
    status: 'pending',
    source: 'fatura',
    updatedAt: '23.05.2026',
    customerId: 'arcelik',
  },
  {
    id: '4',
    materialNo: 'MLZ-100633',
    description: 'Buzdolabı kapı contası (PVC)',
    gtipNo: '3926.90.97.90.18',
    transactionTypes: ['ithalat', 'ihracat', 'transit', 'antrepo'],
    status: 'pending',
    source: 'fatura',
    updatedAt: '22.05.2026',
    customerId: 'arcelik',
  },
  {
    id: '5',
    materialNo: 'MLZ-100204',
    description: 'Cam fırın kapağı paneli',
    gtipNo: '7007.19.80.00.00',
    transactionTypes: ['ihracat'],
    status: 'verified',
    source: 'manuel',
    updatedAt: '02.05.2026',
    customerId: 'arcelik',
  },
  {
    id: '6',
    materialNo: 'MLZ-100990',
    description: 'Paslanmaz çelik iç tank',
    gtipNo: '7310.29.90.00.00',
    transactionTypes: ['ihracat'],
    status: 'pending',
    source: 'fatura',
    updatedAt: '23.05.2026',
    customerId: 'arcelik',
  },
  {
    id: '7',
    materialNo: 'MLZ-100455',
    description: 'Bulaşık mak. sirkülasyon pompası',
    gtipNo: '8413.70.21.00.00',
    transactionTypes: ['ithalat', 'ihracat', 'transit', 'antrepo'],
    status: 'pending',
    source: 'fatura',
    updatedAt: '21.05.2026',
    customerId: 'arcelik',
  },
  {
    id: '8',
    materialNo: 'MLZ-100311',
    description: 'Termostat sensörü',
    gtipNo: '9032.10.20.00.00',
    transactionTypes: ['ithalat', 'ihracat', 'transit', 'antrepo'],
    status: 'verified',
    source: 'manuel',
    updatedAt: '28.04.2026',
    customerId: 'arcelik',
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
    await delay(100);
    return [...CUSTOMERS];
  },
  getRecords: async (customerId: string): Promise<MaterialRecord[]> => {
    await delay(80);
    return RECORDS.filter((r) => r.customerId === customerId).map((r) => ({ ...r }));
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
