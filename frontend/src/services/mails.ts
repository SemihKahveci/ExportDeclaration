import type { MailTemplate } from '../types';
import {
  createMailTemplate,
  deleteMailTemplate,
  listMailTemplates,
  updateMailTemplate,
  type CreateMailTemplatePayload,
} from '../api/mailTemplateApi';

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
