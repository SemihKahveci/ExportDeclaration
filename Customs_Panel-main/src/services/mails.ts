import type { MailTemplate } from '../types';
import { delay } from './utils';

export const MAIL_PROCESS_OPTIONS = [
  { value: 'eksik-evrak',       label: 'Eksik Evrak'              },
  { value: 'gtip-kontrol',      label: 'GTİP Kontrol'             },
  { value: 'beyanname-kontrol', label: 'Beyanname Kontrol'        },
  { value: 'tescil',            label: 'Tescil'                   },
  { value: 'kapanis',           label: 'Kapanış'                  },
  { value: 'mutabakat',         label: 'Mutabakat'                },
  { value: 'musteri-gtip',      label: 'Müşteri GTİP Sorgulama'   },
] as const;

export const MAIL_VARIABLES = [
  '{musteri}',
  '{referans}',
  '{beyanname_no}',
  '{eksik_evraklar}',
  '{gtip_sonuc}',
  '{tescil_no}',
  '{kapanis_durumu}',
  '{tarih}',
  '{sorumlu}',
] as const;

const MOCK: MailTemplate[] = [
  {
    id: 'mail-001',
    name: 'Eksik Evrak Hatırlatma',
    processStep: 'eksik-evrak',
    subject: '[{referans}] Eksik Evrak Hatırlatması',
    body: 'Sayın {musteri},\n\n{tarih} tarihi itibarıyla {referans} referans numaralı gümrük dosyanız için aşağıdaki evrakların temin edilmesi gerekmektedir:\n\n{eksik_evraklar}\n\nLütfen en kısa sürede iletişime geçiniz.\n\nSaygılarımızla,\n{sorumlu}',
    variables: ['{musteri}', '{referans}', '{tarih}', '{eksik_evraklar}', '{sorumlu}'],
    active: true,
  },
  {
    id: 'mail-002',
    name: 'GTİP Uyumsuzluk Bildirimi',
    processStep: 'gtip-kontrol',
    subject: '[{referans}] GTİP Uyumsuzluğu Tespit Edildi',
    body: 'Sayın {musteri},\n\n{referans} referans numaralı dosyanızda GTİP uyumsuzluğu tespit edilmiştir.\n\nGTİP Kontrol Sonucu:\n{gtip_sonuc}\n\nLütfen {sorumlu} ile iletişime geçiniz.\n\nSaygılarımızla,\n{sorumlu}',
    variables: ['{musteri}', '{referans}', '{gtip_sonuc}', '{sorumlu}'],
    active: true,
  },
  {
    id: 'mail-003',
    name: 'Tescil Bilgilendirmesi',
    processStep: 'tescil',
    subject: '[{referans}] Beyannameniz Tescil Edildi — {tescil_no}',
    body: 'Sayın {musteri},\n\n{referans} referans numaralı beyannameniz {tarih} tarihinde {tescil_no} tescil numarasıyla tescil edilmiştir.\n\nBeyanname No: {beyanname_no}\n\nSaygılarımızla,\n{sorumlu}',
    variables: ['{musteri}', '{referans}', '{tarih}', '{tescil_no}', '{beyanname_no}', '{sorumlu}'],
    active: true,
  },
  {
    id: 'mail-004',
    name: 'Kapanış Evrak Maili',
    processStep: 'kapanis',
    subject: '[{referans}] Kapanış Evraklarınız Hazır',
    body: 'Sayın {musteri},\n\n{referans} referans numaralı dosyanıza ait kapanış evrakları hazırlanmıştır.\n\nKapanış Durumu: {kapanis_durumu}\n\nEkleri inceleyerek onayınızı iletmenizi rica ederiz.\n\nSaygılarımızla,\n{sorumlu}',
    variables: ['{musteri}', '{referans}', '{kapanis_durumu}', '{sorumlu}'],
    active: true,
  },
  {
    id: 'mail-005',
    name: 'Mutabakat Bilgilendirmesi',
    processStep: 'mutabakat',
    subject: '[{referans}] Dosya Mutabakat Özeti',
    body: 'Sayın {musteri},\n\n{referans} referans numaralı dosyanıza ait mutabakat tamamlanmıştır.\n\nTescil No: {tescil_no}\nKapanış Durumu: {kapanis_durumu}\nTarih: {tarih}\n\nDetaylar için ekli belgeleri inceleyiniz.\n\nSaygılarımızla,\n{sorumlu}',
    variables: ['{musteri}', '{referans}', '{tescil_no}', '{kapanis_durumu}', '{tarih}', '{sorumlu}'],
    active: true,
  },
  {
    id: 'mail-006',
    name: 'Müşteri GTİP Sonuç Maili',
    processStep: 'musteri-gtip',
    subject: '[{referans}] GTİP Sorgulama Sonucu',
    body: 'Sayın {musteri},\n\nTarafınızdan iletilen GTİP sorgulama talebi sonuçlanmıştır.\n\nSonuç:\n{gtip_sonuc}\n\nEk bilgi için {sorumlu} ile iletişime geçebilirsiniz.\n\nSaygılarımızla,\n{sorumlu}',
    variables: ['{musteri}', '{referans}', '{gtip_sonuc}', '{sorumlu}'],
    active: false,
  },
];

export const mailTemplatesService = {
  list: async (): Promise<MailTemplate[]> => {
    await delay(80);
    return MOCK.map((m) => ({ ...m }));
  },
  save: async (template: MailTemplate): Promise<MailTemplate> => {
    await delay(60);
    const idx = MOCK.findIndex((m) => m.id === template.id);
    if (idx !== -1) {
      MOCK[idx] = { ...template };
    } else {
      MOCK.unshift({ ...template });
    }
    return { ...template };
  },
  delete: async (id: string): Promise<void> => {
    await delay(50);
    const idx = MOCK.findIndex((m) => m.id === id);
    if (idx !== -1) MOCK.splice(idx, 1);
  },
};

// Keep legacy export for backward compatibility
export const mailsService = {
  list: async (): Promise<MailTemplate[]> => mailTemplatesService.list(),
  get: async (id: string): Promise<MailTemplate | null> => {
    await delay(60);
    return MOCK.find((m) => m.id === id) ?? null;
  },
};
