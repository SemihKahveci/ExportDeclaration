import type { MailTemplate } from '../types';
import {
  createMailTemplate,
  deleteMailTemplate,
  listMailTemplates,
  updateMailTemplate,
  type CreateMailTemplatePayload,
} from '../api/mailTemplateApi';

export const MAIL_PROCESS_OPTIONS = [
  { value: 'dosya-olusturuldu', label: 'Dosya Oluşturuldu'        },
  { value: 'eksik-evrak',       label: 'Eksik Evrak Hatırlatma'   },
  { value: 'gtip-kontrol',      label: 'GTİP Eksik/Hatalı'        },
  { value: 'beyanname-kontrol', label: 'Beyanname Kontrol'        },
  { value: 'tescil',            label: 'Tescil'                   },
  { value: 'kapanis',           label: 'Kapanış'                  },
  { value: 'mutabakat',         label: 'Mutabakat'                },
  { value: 'musteri-gtip',      label: 'Müşteri GTİP Sorgulama'   },
] as const;

export const MAIL_FREQUENCY_OPTIONS = [
  'Her 2 saatte bir',
  'Günde 1 kez',
  'Günde 2 kez',
  "Cut-off'a göre dinamik",
  'Manuel takip',
] as const;

export const MAIL_DIGEST_PROCESSES = ['beyanname-kontrol', 'tescil', 'kapanis'] as const;

export const MAIL_VARIABLES = [
  '{musteri}',
  '{referans}',
  '{eksik_evraklar}',
  '{gtip_sonuc}',
  '{tescil_no}',
  '{beyanname_no}',
  '{tarih}',
] as const;

export const MAIL_VARIABLE_HELP: Record<(typeof MAIL_VARIABLES)[number], string> = {
  '{musteri}': 'Müşteri adı.',
  '{referans}': 'Sistemdeki dosya numarası. Birden fazla dosya varsa virgülle yazılır.',
  '{eksik_evraklar}': 'Müşteri evrak kuralında zorunlu olup henüz gelmemiş evraklar. Yalnız gelmeyenler yazılır; birden fazlaysa virgülle ayrılır.',
  '{gtip_sonuc}': 'Veritabanında olmayan veya hatalı eşleşen malzeme no, tanım ve GTİP.',
  '{tescil_no}': 'Tescil başladığında Evrim’den gelen numara.',
  '{beyanname_no}': 'Beyanname numarası.',
  '{tarih}': 'Mailin gönderildiği tarih.',
};

function isMongoId(id: string): boolean {
  return /^[a-f\d]{24}$/i.test(id);
}

function toCreatePayload(template: MailTemplate): CreateMailTemplatePayload {
  return {
    name: template.name,
    processStep: template.processStep,
    subject: template.subject,
    body: template.body,
    variables: template.variables,
    frequency: template.frequency ?? '',
    active: template.active,
  };
}

export const mailTemplatesService = {
  list: async (): Promise<MailTemplate[]> => {
    return listMailTemplates();
  },
  save: async (template: MailTemplate): Promise<MailTemplate> => {
    const payload = toCreatePayload(template);
    if (isMongoId(template.id)) {
      return updateMailTemplate(template.id, payload);
    }
    return createMailTemplate(payload);
  },
  delete: async (id: string): Promise<void> => {
    return deleteMailTemplate(id);
  },
};

export const mailsService = {
  list: async (): Promise<MailTemplate[]> => mailTemplatesService.list(),
  get: async (id: string): Promise<MailTemplate | null> => {
    const rows = await listMailTemplates();
    return rows.find((m) => m.id === id) ?? null;
  },
};
