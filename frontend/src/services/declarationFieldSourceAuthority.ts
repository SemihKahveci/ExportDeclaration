export type DeclarationFieldSource =
  | 'DOCUMENT'
  | 'USER'
  | 'SETTINGS'
  | 'EVRIM'
  | 'CALCULATED'
  | 'OPERATION';

export type DeclarationFieldEvidenceMode = 'DIRECT' | 'BOUNDED_DERIVATION' | 'EXTERNAL';

export interface DeclarationFieldSourceAuthority {
  source: DeclarationFieldSource;
  evidenceMode: DeclarationFieldEvidenceMode;
  /** A missing DOCUMENT value is not an error unless the source document actually contains it. */
  sourcePresentOnly?: boolean;
  note?: string;
}

const D = (evidenceMode: DeclarationFieldEvidenceMode = 'DIRECT', note?: string): DeclarationFieldSourceAuthority => ({ source: 'DOCUMENT', evidenceMode, sourcePresentOnly: true, note });
const U = (note?: string): DeclarationFieldSourceAuthority => ({ source: 'USER', evidenceMode: 'EXTERNAL', note });
const S = (note?: string): DeclarationFieldSourceAuthority => ({ source: 'SETTINGS', evidenceMode: 'EXTERNAL', note });
const E = (note?: string): DeclarationFieldSourceAuthority => ({ source: 'EVRIM', evidenceMode: 'EXTERNAL', note });
const C = (note?: string): DeclarationFieldSourceAuthority => ({ source: 'CALCULATED', evidenceMode: 'EXTERNAL', note });
const O = (note?: string): DeclarationFieldSourceAuthority => ({ source: 'OPERATION', evidenceMode: 'EXTERNAL', note });

/**
 * Product source-authority matrix.
 *
 * The business field document is the authority for DOCUMENT / USER / SETTINGS /
 * EVRIM / CALCULATED ownership where it names the field. UI-only expansions
 * (address, explicit party-country, transport document identifiers, etc.) keep
 * the same semantic source family instead of inventing values.
 *
 * DOCUMENT never means "must be filled". It means: when the source document
 * contains reliable evidence, IDP should extract it. Missing source evidence
 * stays empty/fail-closed.
 */
export const FIELD_SOURCE_AUTHORITY: Record<string, DeclarationFieldSourceAuthority> = {
  'Beyanname No': E(),
  'Referans No': E(),
  'Tescil Tarihi': E(),
  'Rejim': U(),
  'Rejim Kodu': U(),
  'Gümrük İdaresi': U(),
  'Beyan Sahibi / Temsilci': S(),
  'İşlem Niteliği': O(),
  'Beyan Türü': O(),

  'Gönderici / İhracatçı Ünvanı': D(),
  'Gönderici / İhracatçı Adresi': D(),
  'Alıcı / İthalatçı Ünvanı': D(),
  'Alıcı / İthalatçı Adresi': D(),
  'Mali Müşavir / Temsilci Bilgisi': S('Faturada açıkça temsilci kanıtı yoksa türetilmez.'),

  'Gönderici Ülke': D('BOUNDED_DERIVATION', 'Açık ülke veya tartışmasız adres/coğrafya kanıtı.'),
  'Alıcı Ülke': D('BOUNDED_DERIVATION', 'Açık ülke veya tartışmasız adres/coğrafya kanıtı.'),
  'Çıkış Ülkesi': D('BOUNDED_DERIVATION', 'Gönderici ülkeden körlemesine kopyalanmaz.'),
  'Varış Ülkesi': D('BOUNDED_DERIVATION', 'Alıcı ülkeden körlemesine kopyalanmaz.'),
  'Gideceği Ülke': D('BOUNDED_DERIVATION', 'Alıcı/varış ülkesiyle aynı olmak zorunda değildir.'),
  'Menşe Ülke': D(),
  'Ticaret Yapılan Ülke': D('BOUNDED_DERIVATION', 'Alıcı ülkesinden körlemesine kopyalanmaz.'),
  'Teslim Şekli': D(),

  'Taşıma Şekli': D(),
  'Taşıyıcı / Nakliyeci': D(),
  'Çıkış Aracı': D(),
  'Sınır Geçiş Aracı': D(),
  'Plaka': D(),
  'Konteyner No': D(),
  'Konşimento No': D(),
  'CMR No': D(),
  'AWB No': D(),
  'Özet Beyan No': U('İş alanı dokümanında kullanıcı girişi olarak tanımlı.'),
  'Taşıma Senedi No': D(),

  'Fatura No': D(),
  'Fatura Tarihi': D(),
  'Döviz Cinsi': D(),
  'Toplam Fatura Bedeli': D(),
  'Döviz Kuru': D(),
  'İstatistiki Kıymet': C(),
  'Navlun': D(),
  'Sigorta': D(),
  'Ödeme Şekli': D(),
  'Finansal / Banka Bilgisi': D(),

  'Kap Adedi': D(),
  'Kap Cinsi': D(),
  'Brüt Kilo': D(),
  'Net Kilo': D(),

  'Kalem No': D(),
  'Malzeme No': D(),
  'GTİP No': D(),
  'Ticari Tanım': D(),
  'Eşyanın Cinsi': D(),
  'Mal Tanımı': D(),
  'Miktar': D(),
  'Miktar Birimi': D(),
  'Kalem Menşe': D(),
  'Kalem Brüt KG': D('DIRECT', 'Fatura toplam ağırlığı kaleme kopyalanmaz.'),
  'Kalem Net KG': D('DIRECT', 'Fatura toplam ağırlığı kaleme kopyalanmaz.'),
  'Kalem Kıymet': E('Kalem fiyat authority iş alanı dokümanında Evrim olarak tanımlı; IDP satır toplamı ayrı evidence olarak kalabilir.'),
  'Kalem Döviz Cinsi': D(),

  'Muafiyet Kodu': U(),
  'Ek Kod': U(),
  'Ölçü Birimi': D(),
  'Antrepo Kodu': U(),
  'Önceki Belge No': D(),
  'Dolaşım Belgesi No': D(),
  'Menşe Belgesi No': D(),
  'Açıklama / Not Alanı': U(),
};

export function sourceAuthorityFor(field: string): DeclarationFieldSourceAuthority | undefined {
  return FIELD_SOURCE_AUTHORITY[field];
}

export function isDocumentSourcedField(field: string): boolean {
  return sourceAuthorityFor(field)?.source === 'DOCUMENT';
}
