import type { Rule, EvraklarRule, EvraklarPageStats } from '../types';
import { delay } from './utils';

const MOCK: Rule[] = [
  {
    id: 'rule-001',
    name: 'Tekstil İhracat Kuralı',
    description: 'GTİP 62 başlayan ürünler için zorunlu evrak seti',
    conditions: [
      { field: 'gtip_prefix', operator: 'starts_with', value: '62' },
      { field: 'ihracat_tipi', operator: 'equals', value: 'ihracat' },
    ],
    requiredDocuments: ['Fatura', 'Paketleme Listesi', 'A.TR Dolaşım Belgesi'],
    active: true,
    createdAt: '2024-01-15T00:00:00Z',
  },
  {
    id: 'rule-002',
    name: 'Gıda Ürünleri Kuralı',
    description: 'Gıda maddesi içeren gönderiler için sağlık sertifikası zorunludur',
    conditions: [
      { field: 'gtip_prefix', operator: 'starts_with', value: '09' },
      { field: 'rejim', operator: 'equals', value: '10' },
    ],
    requiredDocuments: ['Fatura', 'Sağlık Sertifikası', 'Menşe Şahadetnamesi'],
    active: true,
    createdAt: '2024-02-01T00:00:00Z',
  },
  {
    id: 'rule-003',
    name: 'Makine & Ekipman Kuralı',
    description: 'BIT ürünleri için teknik doküman gerektirir',
    conditions: [
      { field: 'gtip_prefix', operator: 'starts_with', value: '84' },
      { field: 'kiymet', operator: 'greater_than', value: '5000' },
    ],
    requiredDocuments: ['Fatura', 'Teknik Doküman', 'CE Sertifikası'],
    active: false,
    createdAt: '2024-03-10T00:00:00Z',
  },
];

export const rulesService = {
  list: async (): Promise<Rule[]> => {
    await delay(100);
    return [...MOCK];
  },
  get: async (id: string): Promise<Rule | null> => {
    await delay(60);
    return MOCK.find((r) => r.id === id) ?? null;
  },
};

// ─── Evraklar screen data ─────────────────────────────────────────────────────

export const EVRAKLAR_COUNTRIES = [
  'Türkiye', 'Almanya', 'Fransa', 'İtalya', 'İspanya',
  'Hollanda', 'Belçika', 'Avusturya', 'İsveç', 'Polonya',
  'Çekya', 'Macaristan', 'Romanya', 'Bulgaristan', 'Yunanistan',
  'Portekiz', 'Danimarka', 'Finlandiya', 'İrlanda', 'Hırvatistan',
  'Slovenya', 'Slovakya', 'Litvanya', 'Letonya', 'Estonya',
  'Kıbrıs', 'Malta', 'Lüksemburg',
  'AB Ülkeleri (Grup)', 'AB Dışı Ülkeler (Grup)',
  'ABD', 'Birleşik Krallık', 'Japonya', 'Çin', 'Hindistan',
  'Brezilya', 'Kanada', 'Avustralya', 'Güney Kore',
];

export const EVRAKLAR_DOCUMENT_TYPES = [
  'A.TR Dolaşım Belgesi',
  'EUR.1 Dolaşım Sertifikası',
  'EUR-MED Dolaşım Sertifikası',
  'Menşe Şahadetnamesi',
  'Form A (GTS)',
  'Onaylanmış İhracatçı / Fatura Beyanı',
  'ATA Karnesi',
  'Sağlık Sertifikası',
  'Analiz Raporu',
  'Ekspertiz Raporu',
];

let EVRAKLAR_RULES: EvraklarRule[] = [
  {
    id: 'er-001',
    name: 'AB Ülkelerine İhracat — Menşei Belgesi',
    conditions: [
      { field: 'teslim_ulkesi',    operator: 'equals',     value: 'AB Ülkeleri (Grup)', enabled: true },
      { field: 'mensei',           operator: 'equals',     value: 'Türkiye',            enabled: true },
      { field: 'gonderici_ulkesi', operator: 'equals',     value: '',                   enabled: false },
      { field: 'gtip_no',          operator: 'starts_with', value: '',                   enabled: false },
    ],
    requiredDocuments: ['A.TR Dolaşım Belgesi', 'EUR.1 Dolaşım Sertifikası'],
    active: true,
    createdAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 'er-002',
    name: 'Gıda & Tarım Ürünleri — Sağlık Sertifikası',
    conditions: [
      { field: 'gtip_no',          operator: 'starts_with', value: '02',     enabled: true },
      { field: 'teslim_ulkesi',    operator: 'equals',     value: 'Almanya', enabled: true },
      { field: 'mensei',           operator: 'equals',     value: '',        enabled: false },
      { field: 'gonderici_ulkesi', operator: 'equals',     value: '',        enabled: false },
    ],
    requiredDocuments: ['Sağlık Sertifikası', 'Analiz Raporu', 'Menşe Şahadetnamesi'],
    active: true,
    createdAt: '2026-02-01T00:00:00Z',
  },
  {
    id: 'er-003',
    name: 'Kimyasal Madde İhracatı',
    conditions: [
      { field: 'gtip_no',          operator: 'starts_with', value: '28',  enabled: true },
      { field: 'gonderici_ulkesi', operator: 'equals',     value: 'Fransa', enabled: true },
      { field: 'mensei',           operator: 'equals',     value: '',    enabled: false },
      { field: 'teslim_ulkesi',    operator: 'equals',     value: '',    enabled: false },
    ],
    requiredDocuments: ['Analiz Raporu', 'Ekspertiz Raporu'],
    active: false,
    createdAt: '2026-02-20T00:00:00Z',
  },
  {
    id: 'er-004',
    name: 'İngiltere / Brexit Dolaşım',
    conditions: [
      { field: 'teslim_ulkesi',    operator: 'equals',     value: 'Birleşik Krallık', enabled: true },
      { field: 'mensei',           operator: 'equals',     value: 'Türkiye',          enabled: true },
      { field: 'gonderici_ulkesi', operator: 'equals',     value: '',                 enabled: false },
      { field: 'gtip_no',          operator: 'starts_with', value: '',                 enabled: false },
    ],
    requiredDocuments: ['EUR-MED Dolaşım Sertifikası', 'Menşe Şahadetnamesi'],
    active: true,
    createdAt: '2026-03-05T00:00:00Z',
  },
];

function calcStats(): EvraklarPageStats {
  const active  = EVRAKLAR_RULES.filter((r) => r.active).length;
  const allDocs = new Set(EVRAKLAR_RULES.flatMap((r) => r.requiredDocuments));
  return {
    total:    EVRAKLAR_RULES.length,
    active,
    passive:  EVRAKLAR_RULES.length - active,
    docTypes: allDocs.size,
  };
}

export const evraklarService = {
  getStats: async (): Promise<EvraklarPageStats> => {
    await delay(60);
    return calcStats();
  },
  getRules: async (): Promise<EvraklarRule[]> => {
    await delay(80);
    return EVRAKLAR_RULES.map((r) => ({ ...r, conditions: r.conditions.map((c) => ({ ...c })) }));
  },
  getCountries: async (): Promise<string[]> => {
    await delay(40);
    return [...EVRAKLAR_COUNTRIES];
  },
  getDocumentTypes: async (): Promise<string[]> => {
    await delay(40);
    return [...EVRAKLAR_DOCUMENT_TYPES];
  },
  save: async (rule: EvraklarRule): Promise<EvraklarRule> => {
    await delay(80);
    const idx = EVRAKLAR_RULES.findIndex((r) => r.id === rule.id);
    if (idx >= 0) {
      EVRAKLAR_RULES[idx] = { ...rule };
    } else {
      EVRAKLAR_RULES = [{ ...rule }, ...EVRAKLAR_RULES];
    }
    return { ...rule };
  },
  delete: async (id: string): Promise<void> => {
    await delay(60);
    EVRAKLAR_RULES = EVRAKLAR_RULES.filter((r) => r.id !== id);
  },
  toggleActive: async (id: string): Promise<EvraklarRule | null> => {
    await delay(50);
    const rule = EVRAKLAR_RULES.find((r) => r.id === id);
    if (!rule) return null;
    rule.active = !rule.active;
    return { ...rule };
  },
};
