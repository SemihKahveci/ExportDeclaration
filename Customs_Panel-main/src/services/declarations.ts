import type {
  Declaration,
  BeyannameRecord, BeyannamePageStats,
  BeyannameListeItem,
  FieldBox, ParsedSourceCard,
  TescilRecord, TescilPageStats,
  KapanicFile, KapanicDoc, KapanicCostItem, KapanicControlItem, KapanicPageStats,
  BeyannameFormFields,
  MtKontrolMapping,
} from '../types';
import { delay } from './utils';

const MOCK: Declaration[] = [
  {
    id: 'dcl-001',
    ref: 'IHR-2024-001',
    customer: 'Anadolu Tekstil A.Ş.',
    status: 'tescilli',
    tescilNo: '24IHR000123',
    createdAt: '2024-05-10T08:00:00Z',
  },
  {
    id: 'dcl-002',
    ref: 'IHR-2024-003',
    customer: 'Karadeniz Gıda San.',
    status: 'tescilli',
    tescilNo: '24IHR000145',
    createdAt: '2024-05-08T07:45:00Z',
  },
  {
    id: 'dcl-003',
    ref: 'IHR-2024-004',
    customer: 'Ege Kimya A.Ş.',
    status: 'taslak',
    createdAt: '2024-05-12T11:00:00Z',
  },
];

export const declarationsService = {
  list: async (): Promise<Declaration[]> => {
    await delay(100);
    return [...MOCK];
  },
  get: async (id: string): Promise<Declaration | null> => {
    await delay(80);
    return MOCK.find((d) => d.id === id) ?? null;
  },
};

// ─── Beyanname Yazım & Kontrol screen ────────────────────────────────────────

const DEFAULT_FORM_FIELDS: BeyannameFormFields = {
  beyan:         'AN 7',
  gumrukIdaresi: 'ERENKÖY GÜMRÜK MÜDÜRLÜĞÜ',
  referansNo:    '26-03015',
  tescilTarihi:  '22.05.2026',
  gonderici:     'DRINIQUE - 5720 S 40TH STREET SUITE 3 PHOENIX',
  alici:         'ACCOLINK İÇ VE DIŞ TİCARET - SELİM YUNA',
  teslimSekli:   'EXW',
  doviz:         'USD',
  toplamFatura:  '13.194,66',
  kapBrut:       '2 KAP / 366,00 KG',
  ticariTanim:   'PLASTİK BARDAK / PLASTİK ŞARAP SOĞUTMA KOVASI',
};

const BEYANNAME_RECORDS: BeyannameRecord[] = [
  {
    id: 'byn-001',
    ref: 'ANT-4631',
    tescilNo: '26341200AN00121061',
    customer: 'Eczacıbaşı Holding',
    customerId: 'eczaci',
    rejim: 'AN 7',
    durumLabel: 'Onaya Hazır',
    status: 'taslak',
    transportMode: 'Karayolu',
    docCount: 5,
    lateDocCount: 1,
    lineCount: 6,
    warningCount: 0,
    formFields: {
      ...DEFAULT_FORM_FIELDS,
      gonderici: 'DRINIQUE - 5720 S 40TH STREET SUITE 3 PHOENIX',
      alici:     'ECZACIBAŞİ HOLDİNG A.Ş.',
      beyan:     'AN 7',
    },
    fieldValues: {
      'Beyanname No':                    '26341200AN00121061',
      'Referans No':                     '26-03015',
      'Tescil Tarihi':                   '22.05.2026',
      'Rejim':                           'AN 7',
      'Rejim Kodu':                      'AN',
      'Gümrük İdaresi':                  'ERENKÖY GÜMRÜK MÜDÜRLÜĞÜ',
      'Beyan Sahibi / Temsilci':         'LIVA GÜMRÜK MÜŞAVİRLİĞİ A.Ş.',
      'İşlem Niteliği':                  'Normal',
      'Beyan Türü':                      'Standart',
      'Gönderici / İhracatçı Ünvanı':   'DRINIQUE INC.',
      'Gönderici / İhracatçı Adresi':   '5720 S 40TH STREET SUITE 3 PHOENIX AZ 85040 USA',
      'Alıcı / İthalatçı Ünvanı':       'ECZACIBAŞİ HOLDİNG A.Ş.',
      'Alıcı / İthalatçı Adresi':       'BÜYÜKDERE CAD. NO:185 ŞİŞLİ İSTANBUL',
      'Mali Müşavir / Temsilci Bilgisi': 'LIVA GÜMRÜK MÜŞAVİRLİĞİ',
      'Gönderici Ülke':                  'US',
      'Alıcı Ülke':                      'TR',
      'Çıkış Ülkesi':                    'US',
      'Varış Ülkesi':                    'TR',
      'Teslim Şekli':                    'EXW',
      'Taşıma Şekli':                    'Karayolu',
      'Taşıyıcı / Nakliyeci':            'GÜVEN NAKLİYAT LTD.',
      'Plaka':                           '34 ABC 123',
      'Fatura No':                       'INV23673',
      'Fatura Tarihi':                   '14.05.2026',
      'Döviz Cinsi':                     'USD',
      'Toplam Fatura Bedeli':            '13.194,66',
      'Navlun':                          '320,00',
      'Sigorta':                         '45,00',
      'Ödeme Şekli':                     'Akreditif',
      'Kap Adedi':                       '2',
      'Kap Cinsi':                       'Karton',
      'Brüt Kilo':                       '366,00',
      'Net Kilo':                        '329,40',
    },
    fieldMappings: [],
    docs: [
      { id: 'bd1', name: 'Beyanname Taslağı',    status: 'geldi',   note: 'PDF · 2 sayfa' },
      { id: 'bd2', name: 'Fatura',               status: 'geldi',   note: '14.05.2026 / INV23673' },
      { id: 'bd3', name: 'Navlun Makbuzu',       status: 'geldi',   note: '21.05.2026 / NU02026000000084' },
      { id: 'bd4', name: 'Çeki Listesi',         status: 'geldi',   note: 'PDF · %88' },
      { id: 'bd5', name: 'Sonradan Gelen Evrak', status: 'kosullu', note: 'İşaretlenirse tekrar yazılır' },
    ],
    fields: [
      { key: 'gonderici', label: 'Gönderici',   value: 'DRINIQUE',                    source: 'Fatura',  conflict: false },
      { key: 'alici',     label: 'Alıcı',        value: 'Eczacıbaşı Holding',          source: 'Fatura',  conflict: false },
      { key: 'beyan',     label: 'Beyan',        value: 'AN 7',                        source: 'Manuel',  conflict: false },
      { key: 'referans',  label: 'Referans',     value: '26-03015',                    source: 'Sistem',  conflict: false },
      { key: 'fatura',    label: 'Fatura',       value: '14.05.2026 / INV23673',       source: 'Fatura',  conflict: false },
      { key: 'navlun',    label: 'Navlun',       value: '21.05.2026 / NU02026000000084', source: 'Navlun', conflict: false },
    ],
    lineItems: [
      { lineNo: 1, gtip: '39241000', description: 'PLASTİK BARDAK',               quantity: '1.776 AD', mense: 'ABD', brutKg: '307,42', netKg: '276,68', kiymet: '13.599,20' },
      { lineNo: 2, gtip: '39241000', description: 'PLASTİK ŞARAP SOĞUTMA KOVASI', quantity: '15 AD',    mense: 'ABD', brutKg: '58,58',  netKg: '52,72',  kiymet: '2.591,30'  },
    ],
  },
  {
    id: 'byn-002',
    ref: 'EXP-4638',
    tescilNo: '26341200EX00138112',
    customer: 'BSH Ev Aletleri Sanayi',
    customerId: 'bsh',
    rejim: '10 — İhracat',
    durumLabel: 'Eksik evrakla yazıldı',
    status: 'kontrol',
    transportMode: 'Karayolu',
    docCount: 5,
    lateDocCount: 1,
    lineCount: 11,
    warningCount: 1,
    formFields: {
      beyan:         '10',
      gumrukIdaresi: 'TUZLA GÜMRÜK MÜDÜRLÜĞÜ',
      referansNo:    '26-03038',
      tescilTarihi:  '27.05.2026',
      gonderici:     'BSH EV ALETLERİ SANAYİ VE TİCARET A.Ş.',
      alici:         'BSH HAUSGERÄTE GmbH, MÜNCHEN',
      teslimSekli:   'DAP',
      doviz:         'EUR',
      toplamFatura:  '48.500,00',
      kapBrut:       '20 KAP / 1.260,00 KG',
      ticariTanim:   'BULAŞIK MAKİNESİ MOTORU / ÇAMAŞIR MAKİNESİ MOTORU',
    },
    fieldValues: {
      'Beyanname No':                    '26341200EX00138112',
      'Referans No':                     '26-03038',
      'Tescil Tarihi':                   '27.05.2026',
      'Rejim':                           '10 — İhracat',
      'Rejim Kodu':                      '10',
      'Gümrük İdaresi':                  'TUZLA GÜMRÜK MÜDÜRLÜĞÜ',
      'Beyan Sahibi / Temsilci':         'LIVA GÜMRÜK MÜŞAVİRLİĞİ A.Ş.',
      'İşlem Niteliği':                  'Normal',
      'Beyan Türü':                      'Standart',
      'Gönderici / İhracatçı Ünvanı':   'BSH EV ALETLERİ SANAYİ VE TİCARET A.Ş.',
      'Gönderici / İhracatçı Adresi':   'ESKİŞEHİR YOLU 7. KM. TEKELİOĞLU CAD. NO:2 ÇERKEZKÖY/TEKİRDAĞ',
      'Alıcı / İthalatçı Ünvanı':       'BSH HAUSGERÄTE GmbH',
      'Alıcı / İthalatçı Adresi':       'CARL-WERY-STR. 34, 81739 MÜNCHEN, ALMANYA',
      'Gönderici Ülke':                  'TR',
      'Alıcı Ülke':                      'DE',
      'Çıkış Ülkesi':                    'TR',
      'Varış Ülkesi':                    'DE',
      'Teslim Şekli':                    'DAP',
      'Taşıma Şekli':                    'Karayolu',
      'Taşıyıcı / Nakliyeci':            'STAR LOJİSTİK A.Ş.',
      'Plaka':                           '59 XY 456',
      'CMR No':                          'CMR-2026-004882',
      'Fatura No':                       'INV48500',
      'Fatura Tarihi':                   '20.05.2026',
      'Döviz Cinsi':                     'EUR',
      'Toplam Fatura Bedeli':            '48.500,00',
      'Navlun':                          '1.200,00',
      'Ödeme Şekli':                     'Havale',
      'Kap Adedi':                       '20',
      'Kap Cinsi':                       'Palet',
      'Brüt Kilo':                       '1.260,00',
      'Net Kilo':                        '1.140,00',
    },
    fieldMappings: [],
    docs: [
      { id: 'bd1', name: 'Beyanname Taslağı',    status: 'geldi',   note: 'PDF · 2 sayfa' },
      { id: 'bd2', name: 'Fatura',               status: 'geldi',   note: '20.05.2026 / INV48500' },
      { id: 'bd3', name: 'CMR',                  status: 'geldi',   note: 'PDF · Kap uyumsuz' },
      { id: 'bd4', name: 'ATR',                  status: 'eksik',   note: 'Müşteriden bekleniyor' },
      { id: 'bd5', name: 'Sonradan Gelen Evrak', status: 'kosullu', note: 'İşaretlenirse tekrar yazılır' },
    ],
    fields: [
      { key: 'gonderici', label: 'Gönderici',   value: 'BSH Ev Aletleri San.',           source: 'Fatura',  conflict: false },
      { key: 'alici',     label: 'Alıcı',        value: 'BSH Hausgeräte GmbH, München',  source: 'Fatura',  conflict: false },
      { key: 'beyan',     label: 'Beyan',        value: '10 — İhracat',                  source: 'Manuel',  conflict: false },
      { key: 'kap',       label: 'Kap Adedi',    value: '20',                            source: 'CMR',     conflict: true  },
      { key: 'kilo',      label: 'Brüt Kilo',    value: '1.260 KG',                      source: 'CMR',     conflict: true  },
      { key: 'kiymet',    label: 'Kıymet',       value: '48.500,00 EUR',                 source: 'Fatura',  conflict: false },
    ],
    lineItems: [
      { lineNo: 1, gtip: '8501.40.00.00.11', description: 'BULAŞIK MAKİNESİ MOTORU',  quantity: '120 AD', mense: 'TR', brutKg: '620,00', netKg: '560,00', kiymet: '12.500,00' },
      { lineNo: 2, gtip: '8501.40.00.00.12', description: 'ÇAMAŞIR MAKİNESİ MOTORU', quantity: '80 AD',  mense: 'TR', brutKg: '640,00', netKg: '580,00', kiymet: '18.000,00' },
    ],
  },
  {
    id: 'byn-003',
    ref: 'IMP-4644',
    tescilNo: '26341200IM00144312',
    customer: 'Tofaş Türk Otomobil Fab.',
    customerId: 'tofas',
    rejim: '40 — İthalat',
    durumLabel: 'Yazım Bekliyor',
    status: 'taslak',
    transportMode: 'Denizyolu',
    docCount: 7,
    lateDocCount: 0,
    lineCount: 3,
    warningCount: 0,
    formFields: {
      beyan:         '40',
      gumrukIdaresi: 'HAYDARPAŞA GÜMRÜK MÜDÜRLÜĞÜ',
      referansNo:    '26-03044',
      tescilTarihi:  '26.05.2026',
      gonderici:     'FIAT AUTO SPA, TORINO, İTALYA',
      alici:         'TOFAŞ TÜRK OTOMOBİL FABRİKASI A.Ş., BURSA',
      teslimSekli:   'CIF',
      doviz:         'EUR',
      toplamFatura:  '124.800,00',
      kapBrut:       '42 KAP / 3.820,00 KG',
      ticariTanim:   'FREN KALİPER YATAK / ARKA AKS MİLİ',
    },
    fieldValues: {
      'Beyanname No':                    '26341200IM00144312',
      'Referans No':                     '26-03044',
      'Tescil Tarihi':                   '26.05.2026',
      'Rejim':                           '40 — İthalat',
      'Rejim Kodu':                      '40',
      'Gümrük İdaresi':                  'HAYDARPAŞA GÜMRÜK MÜDÜRLÜĞÜ',
      'Beyan Sahibi / Temsilci':         'LIVA GÜMRÜK MÜŞAVİRLİĞİ A.Ş.',
      'Gönderici / İhracatçı Ünvanı':   'FIAT AUTO SPA',
      'Gönderici / İhracatçı Adresi':   'VIA NIZZA 250, 10126 TORINO, İTALYA',
      'Alıcı / İthalatçı Ünvanı':       'TOFAŞ TÜRK OTOMOBİL FABRİKASI A.Ş.',
      'Alıcı / İthalatçı Adresi':       'BURSA ULUDAĞ ORGANİZE SANAYİ BÖLGESİ, BURSA',
      'Gönderici Ülke':                  'IT',
      'Alıcı Ülke':                      'TR',
      'Çıkış Ülkesi':                    'IT',
      'Varış Ülkesi':                    'TR',
      'Teslim Şekli':                    'CIF',
      'Taşıma Şekli':                    'Denizyolu',
      'Taşıyıcı / Nakliyeci':            'COSCO SHIPPING LINES',
      'Konşimento No':                   'COSU-BKK123456',
      'Fatura No':                       'FCA-88122',
      'Fatura Tarihi':                   '19.05.2026',
      'Döviz Cinsi':                     'EUR',
      'Toplam Fatura Bedeli':            '124.800,00',
      'Navlun':                          '3.200,00',
      'Sigorta':                         '280,00',
      'Ödeme Şekli':                     'Akreditif',
      'Kap Adedi':                       '42',
      'Kap Cinsi':                       'Ahşap Kasa',
      'Brüt Kilo':                       '3.820,00',
      'Net Kilo':                        '3.480,00',
    },
    fieldMappings: [],
    docs: [
      { id: 'bd1', name: 'Beyanname Taslağı',    status: 'geldi',   note: 'PDF · 2 sayfa' },
      { id: 'bd2', name: 'Fatura',               status: 'geldi',   note: '19.05.2026 / FCA-88122' },
      { id: 'bd3', name: 'Konşimento',           status: 'geldi',   note: 'PDF · 3 orijinal' },
      { id: 'bd4', name: 'Çeki Listesi',         status: 'geldi',   note: 'PDF · %90' },
      { id: 'bd5', name: 'Sonradan Gelen Evrak', status: 'kosullu', note: 'İşaretlenirse tekrar yazılır' },
    ],
    fields: [
      { key: 'gonderici', label: 'Gönderici',   value: 'Fiat Auto SpA, Torino',       source: 'Fatura',  conflict: false },
      { key: 'alici',     label: 'Alıcı',        value: 'Tofaş Türk Otomobil Fab.',   source: 'Fatura',  conflict: false },
      { key: 'kiymet',    label: 'Kıymet',       value: '124.800,00 EUR',             source: 'Fatura',  conflict: false },
    ],
    lineItems: [
      { lineNo: 1, gtip: '8708.99.97.90.18', description: 'ARKA AKS MİLİ',        quantity: '500 AD', mense: 'IT', brutKg: '2.200,00', netKg: '2.000,00', kiymet: '72.000,00' },
      { lineNo: 2, gtip: '8708.30.91.00.00', description: 'FREN KALİPER YATAK',   quantity: '200 AD', mense: 'IT', brutKg: '1.620,00', netKg: '1.480,00', kiymet: '52.800,00' },
    ],
  },
];

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
    await delay(80);
    return BEYANNAME_RECORDS.map((r) => ({ ...r }));
  },
  getRecord: async (id: string): Promise<BeyannameRecord | null> => {
    await delay(60);
    return BEYANNAME_RECORDS.find((r) => r.id === id) ?? null;
  },
  getStats: async (recordId: string): Promise<BeyannamePageStats> => {
    await delay(40);
    const r = BEYANNAME_RECORDS.find((rec) => rec.id === recordId);
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
    await delay(30);
    return [...BEYANNAME_FIELD_BOXES];
  },
  getSourceCards: async (): Promise<ParsedSourceCard[]> => {
    await delay(30);
    return [...BEYANNAME_SOURCE_CARDS];
  },
  getMtKontrolMappings: async (): Promise<MtKontrolMapping[]> => {
    await delay(30);
    return [...MT_KONTROL_MAPPINGS];
  },
};

// ─── Beyanname Liste screen ───────────────────────────────────────────────────

const BEYANNAME_LISTE_ITEMS: BeyannameListeItem[] = [
  { id: 'bl-001', ref: 'ANT-4631', date: '27.05.2026', customer: 'Eczacıbaşı Holding',         customerCity: 'İstanbul', islemTipi: 'Antrepo',  status: 'onaya-hazir',      transportMode: 'karayolu',  lineCount: 6,  docCount: 5,  totalDocCount: 5,  warningCount: 0, missingDocuments: [],                                      gtipStatus: 'uygun',            assignee: 'M. Demir',   updatedAt: '15 dk önce' },
  { id: 'bl-002', ref: 'EXP-4638', date: '27.05.2026', customer: 'BSH Ev Aletleri Sanayi',     customerCity: 'İstanbul', islemTipi: 'İhracat',  status: 'kontrol-bekliyor', transportMode: 'karayolu',  lineCount: 11, docCount: 5,  totalDocCount: 5,  warningCount: 1, missingDocuments: ['ATR'],                                 gtipStatus: 'uyumsuz',          assignee: 'E. Aydın',   updatedAt: '42 dk önce' },
  { id: 'bl-003', ref: 'IMP-4644', date: '26.05.2026', customer: 'Tofaş Türk Otomobil Fab.',   customerCity: 'Bursa',    islemTipi: 'İthalat',  status: 'yazim-bekliyor',   transportMode: 'denizyolu', lineCount: 3,  docCount: 7,  totalDocCount: 7,  warningCount: 0, missingDocuments: [],                                      gtipStatus: 'kontrol-bekliyor', assignee: 'M. Demir',   updatedAt: '1 sa önce'  },
  { id: 'bl-004', ref: 'EXP-4650', date: '26.05.2026', customer: 'AyGaz A.Ş.',                 customerCity: 'İstanbul', islemTipi: 'İhracat',  status: 'kontrol-uyarisi',  transportMode: 'karayolu',  lineCount: 5,  docCount: 4,  totalDocCount: 5,  warningCount: 2, missingDocuments: ['Menşe Şahadetnamesi', 'Çeki Listesi'], gtipStatus: 'eksik',            assignee: 'S. Kaya',    updatedAt: '2 sa önce'  },
  { id: 'bl-005', ref: 'TRN-4655', date: '25.05.2026', customer: 'Arçelik A.Ş.',               customerCity: 'İstanbul', islemTipi: 'Transit',  status: 'yazim-bekliyor',   transportMode: 'havayolu',  lineCount: 9,  docCount: 6,  totalDocCount: 6,  warningCount: 0, missingDocuments: [],                                      gtipStatus: 'uygun',            assignee: 'A. Yılmaz',  updatedAt: '3 sa önce'  },
];

export interface DocumentUploadPayload {
  ref: string;
  customer: string;
  docType: string;
  file: File | null;
  note: string;
}

export const beyannameListeService = {
  getItems: async (): Promise<BeyannameListeItem[]> => {
    await delay(80);
    return [...BEYANNAME_LISTE_ITEMS];
  },
  uploadDocument: async (_payload: DocumentUploadPayload): Promise<void> => {
    await delay(200);
  },
};

// ─── Beyanname Tescil screen ──────────────────────────────────────────────────

const TESCIL_RECORDS: TescilRecord[] = [
  {
    id: 'tsc-001',
    ref: 'EXP-4592',
    type: 'İhracat',
    customer: 'ACCOLINK İç ve Dış Ticaret',
    tescilNo: '26341200AN00121061',
    line: 'Mavi',
    status: 'started',
    hasSecondNotif: false,
    risk: 'Sarı / kırmızı kontrolü bekleniyor',
    days: 2,
    updatedAt: '27.05.2026 14:20',
  },
  {
    id: 'tsc-002',
    ref: 'IMP-4601',
    type: 'İthalat',
    customer: 'Ford Otosan',
    tescilNo: '26341200IM00188412',
    line: 'Sarı',
    status: 'started',
    hasSecondNotif: false,
    risk: 'Belge kontrolü devam ediyor',
    days: 4,
    updatedAt: '26.05.2026 09:45',
  },
  {
    id: 'tsc-003',
    ref: 'EXP-4615',
    type: 'İhracat',
    customer: 'Vestel Ticaret',
    tescilNo: '26341200EX00124092',
    line: 'Yeşil',
    status: 'completed',
    hasSecondNotif: true,
    risk: 'Sarı / kırmızıya düşmedi',
    days: 1,
    updatedAt: '25.05.2026 16:08',
  },
  {
    id: 'tsc-004',
    ref: 'ANT-4631',
    type: 'Antrepo',
    customer: 'Şişecam',
    tescilNo: '26341200AN00121105',
    line: 'Kırmızı',
    status: 'started',
    hasSecondNotif: false,
    risk: 'Fiziki kontrol bekleniyor',
    days: 6,
    updatedAt: '22.05.2026 11:30',
  },
];

const TESCIL_STATS: TescilPageStats = {
  waiting: 14,
  started: 8,
  completed: 5,
  yellowRed: 3,
  blueGreenTracking: 2,
};

export const tescilService = {
  getRecords: async (): Promise<TescilRecord[]> => {
    await delay(80);
    // Exclude completed registrations — they flow to /kapanis and then to archive
    return TESCIL_RECORDS.filter((r) => r.status !== 'completed').map((r) => ({ ...r }));
  },
  getStats: async (): Promise<TescilPageStats> => {
    await delay(50);
    return { ...TESCIL_STATS };
  },
};

// ─── Kapanış & Mutabakat screen ───────────────────────────────────────────────

const KAPANIS_FILES: KapanicFile[] = [
  {
    id: 'kap-001',
    ref: 'EXP-4592',
    customer: 'ACCOLINK İç ve Dış Ticaret',
    tescilNo: '26341200AN00121061',
    status: 'kontrol-bekliyor',
    tescilDurumu: 'Tamamlandı',
    kapanicDurumu: 'Teslim evrakı bekleniyor',
    mailRecipient: 'customs@accolink.com',
    mailSubject: "26341200AN00121061 No'lu Beyanname Evrakları",
    mailBody: 'Merhaba,\n\nİlgili beyanname ve kapanış evrakları ekte bilgilerinize sunulmuştur.\n\nİyi çalışmalar.',
  },
  {
    id: 'kap-002',
    ref: 'EXP-4615',
    customer: 'Vestel Ticaret',
    tescilNo: '26341200EX00124092',
    status: 'mutabakat-hazir',
    tescilDurumu: 'Tamamlandı',
    kapanicDurumu: 'Mutabakat hazır',
    mailRecipient: 'gumruk@vestel.com.tr',
    mailSubject: "26341200EX00124092 No'lu Beyanname Evrakları",
    mailBody: 'Merhaba,\n\nİlgili beyanname ve kapanış evrakları ekte bilgilerinize sunulmuştur.\n\nİyi çalışmalar.',
  },
  {
    id: 'kap-003',
    ref: 'IMP-4601',
    customer: 'Ford Otosan',
    tescilNo: '26341200IM00188412',
    status: 'maliyet-bekliyor',
    tescilDurumu: 'Tamamlandı',
    kapanicDurumu: 'Maliyet kalemi bekleniyor',
    mailRecipient: 'gumruk@fordotosan.com.tr',
    mailSubject: "26341200IM00188412 No'lu Beyanname Evrakları",
    mailBody: 'Merhaba,\n\nİlgili beyanname ve kapanış evrakları ekte bilgilerinize sunulmuştur.\n\nİyi çalışmalar.',
  },
  {
    id: 'kap-004',
    ref: 'ANT-4631',
    customer: 'Şişecam',
    tescilNo: '26341200AN00121105',
    status: 'kapandi',
    tescilDurumu: 'Tamamlandı',
    kapanicDurumu: 'Kapandı',
    mailRecipient: 'gumruk@sisecam.com',
    mailSubject: "26341200AN00121105 No'lu Beyanname Evrakları",
    mailBody: 'Merhaba,\n\nİlgili beyanname ve kapanış evrakları ekte bilgilerinize sunulmuştur.\n\nİyi çalışmalar.',
  },
];

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

const KAPANIS_STATS: KapanicPageStats = {
  waiting:     11,
  uploaded:    7,
  reconciled:  5,
  warnings:    3,
  costPending: 2,
};

export const kapanisService = {
  getFiles: async (): Promise<KapanicFile[]> => {
    await delay(80);
    // Exclude fully-closed files — they belong in the archive
    return KAPANIS_FILES.filter((f) => f.status !== 'kapandi').map((f) => ({ ...f }));
  },
  getDocs: async (): Promise<KapanicDoc[]> => {
    await delay(50);
    return KAPANIS_DOCS.map((d) => ({ ...d }));
  },
  getCosts: async (): Promise<KapanicCostItem[]> => {
    await delay(50);
    return KAPANIS_COSTS.map((c) => ({ ...c }));
  },
  getControls: async (): Promise<KapanicControlItem[]> => {
    await delay(30);
    return KAPANIS_CONTROLS.map((c) => ({ ...c }));
  },
  getStats: async (): Promise<KapanicPageStats> => {
    await delay(40);
    return { ...KAPANIS_STATS };
  },
};
