import type { MailTemplateDoc } from "./mailTemplate.model.js";

export interface MailTemplateDto {
  id: string;
  name: string;
  processStep: string;
  subject: string;
  body: string;
  variables: string[];
  active: boolean;
}

export function toMailTemplateDto(doc: MailTemplateDoc): MailTemplateDto {
  return {
    id: String(doc._id),
    name: doc.name,
    processStep: doc.processStep,
    subject: doc.subject,
    body: doc.body ?? "",
    variables: doc.variables ?? [],
    active: doc.active
  };
}
