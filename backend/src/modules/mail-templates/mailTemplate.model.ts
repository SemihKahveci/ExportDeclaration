import mongoose, { Schema } from "mongoose";

export const MAIL_PROCESS_STEPS = [
  "eksik-evrak",
  "gtip-kontrol",
  "beyanname-kontrol",
  "tescil",
  "kapanis",
  "mutabakat",
  "musteri-gtip"
] as const;

export interface MailTemplateDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  name: string;
  processStep: (typeof MAIL_PROCESS_STEPS)[number];
  subject: string;
  body: string;
  variables: string[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MailTemplateSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true },
    processStep: { type: String, enum: MAIL_PROCESS_STEPS, required: true },
    subject: { type: String, required: true, trim: true },
    body: { type: String, default: "" },
    variables: { type: [String], default: [] },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

MailTemplateSchema.index({ companyId: 1, name: 1 });

export const MailTemplateModel =
  mongoose.models.MailTemplate ??
  mongoose.model<MailTemplateDoc>("MailTemplate", MailTemplateSchema);
