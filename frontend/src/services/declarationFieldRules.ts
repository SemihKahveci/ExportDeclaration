import type { DeclarationFieldRule } from '../types';
import {
  createDeclarationFieldRule,
  deleteDeclarationFieldRule,
  listDeclarationFieldRules,
  updateDeclarationFieldRule,
} from '../api/customerApi';

export const FIELD_GROUPS: { label: string; fields: string[] }[] = [
  {
    label: 'Genel Beyan Bilgileri',
    fields: [
      'Beyanname No',
      'Referans No',
      'Tescil Tarihi',
      'Rejim',
      'Rejim Kodu',
      'Gümrük İdaresi',
      'Beyan Sahibi / Temsilci',
      'İşlem Niteliği',
      'Beyan Türü',
    ],
  },
  {
    label: 'Taraf Bilgileri',
    fields: [
      'Gönderici / İhracatçı Ünvanı',
      'Gönderici / İhracatçı Adresi',
      'Alıcı / İthalatçı Ünvanı',
      'Alıcı / İthalatçı Adresi',
      'Mali Müşavir / Temsilci Bilgisi',
    ],
  },
  {
    label: 'Ülke ve Teslimat Bilgileri',
    fields: [
      'Gönderici Ülke',
      'Alıcı Ülke',
      'Çıkış Ülkesi',
      'Varış Ülkesi',
      'Gideceği Ülke',
      'Menşe Ülke',
      'Ticaret Yapılan Ülke',
      'Teslim Şekli',
    ],
  },
  {
    label: 'Taşıma Bilgileri',
    fields: [
      'Taşıma Şekli',
      'Taşıyıcı / Nakliyeci',
      'Çıkış Aracı',
      'Sınır Geçiş Aracı',
      'Plaka',
      'Konteyner No',
      'Konşimento No',
      'CMR No',
      'AWB No',
      'Özet Beyan No',
      'Taşıma Senedi No',
    ],
  },
  {
    label: 'Fatura ve Kıymet Bilgileri',
    fields: [
      'Fatura No',
      'Fatura Tarihi',
      'Döviz Cinsi',
      'Toplam Fatura Bedeli',
      'Döviz Kuru',
      'İstatistiki Kıymet',
      'Navlun',
      'Sigorta',
      'Ödeme Şekli',
      'Finansal / Banka Bilgisi',
    ],
  },
  {
    label: 'Kap ve Ağırlık Bilgileri',
    fields: [
      'Kap Adedi',
      'Kap Cinsi',
      'Brüt Kilo',
      'Net Kilo',
    ],
  },
  {
    label: 'Kalem / Malzeme Bilgileri',
    fields: [
      'Kalem No',
      'Malzeme No',
      'GTİP No',
      'Ticari Tanım',
      'Eşyanın Cinsi',
      'Mal Tanımı',
      'Miktar',
      'Miktar Birimi',
      'Kalem Menşe',
      'Kalem Brüt KG',
      'Kalem Net KG',
      'Kalem Kıymet',
      'Kalem Döviz Cinsi',
    ],
  },
  {
    label: 'Rejim / Muafiyet / Ek Bilgiler',
    fields: [
      'Muafiyet Kodu',
      'Ek Kod',
      'Ölçü Birimi',
      'Antrepo Kodu',
      'Önceki Belge No',
      'Dolaşım Belgesi No',
      'Menşe Belgesi No',
      'Açıklama / Not Alanı',
    ],
  },
];

export const SOURCE_DOCUMENT_OPTIONS: string[] = [
  'Fatura',
  'Çeki Listesi',
  'CMR',
  'Konşimento',
  'AWB',
  'Booking',
  'Dolaşım Belgesi',
  'Menşe Şahadetnamesi',
  'Müşteri Kartı',
  'Müşteri Adres Kaydı',
  'GTİP Veri Tabanı',
  'Manuel Giriş',
];

export const CONFLICT_ACTION_OPTIONS: string[] = [
  'Ana kaynak öncelikli',
  'Kullanıcıya göster',
  'Müşteriye sor',
  'Manuel karar iste',
];

function isMongoId(id: string): boolean {
  return /^[a-f\d]{24}$/i.test(id);
}

export const declarationFieldRulesService = {
  getRules: async (customerId: string): Promise<DeclarationFieldRule[]> => {
    if (!customerId) return [];
    return listDeclarationFieldRules(customerId);
  },
  save: async (
    customerId: string,
    id: string | undefined,
    data: Omit<DeclarationFieldRule, 'id' | 'customerId'>
  ): Promise<DeclarationFieldRule> => {
    if (id && isMongoId(id)) return updateDeclarationFieldRule(id, data);
    return createDeclarationFieldRule(customerId, data);
  },
  delete: async (id: string): Promise<void> => {
    return deleteDeclarationFieldRule(id);
  },
};
