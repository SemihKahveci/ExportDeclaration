import type { Rule, EvraklarRule, EvraklarPageStats } from '../types';
import {
  createEvrakRule,
  deleteEvrakRule,
  getEvrakRuleStats,
  listEvrakRules,
  toggleEvrakRule,
  updateEvrakRule,
  type CreateEvrakRulePayload,
} from '../api/evrakRuleApi';
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

// ─── Evraklar screen – reference lists (form dropdowns) ───────────────────────

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

function isMongoId(id: string): boolean {
  return /^[a-f\d]{24}$/i.test(id);
}

function toCreatePayload(rule: EvraklarRule): CreateEvrakRulePayload {
  return {
    name: rule.name,
    conditions: rule.conditions,
    requiredDocuments: rule.requiredDocuments,
    active: rule.active,
  };
}

export const evraklarService = {
  getStats: async (): Promise<EvraklarPageStats> => {
    return getEvrakRuleStats();
  },
  getRules: async (): Promise<EvraklarRule[]> => {
    return listEvrakRules();
  },
  getCountries: async (): Promise<string[]> => {
    return [...EVRAKLAR_COUNTRIES];
  },
  getDocumentTypes: async (): Promise<string[]> => {
    return [...EVRAKLAR_DOCUMENT_TYPES];
  },
  save: async (rule: EvraklarRule): Promise<EvraklarRule> => {
    const payload = toCreatePayload(rule);
    if (isMongoId(rule.id)) {
      return updateEvrakRule(rule.id, payload);
    }
    return createEvrakRule(payload);
  },
  delete: async (id: string): Promise<void> => {
    return deleteEvrakRule(id);
  },
  toggleActive: async (id: string): Promise<EvraklarRule | null> => {
    return toggleEvrakRule(id);
  },
};
