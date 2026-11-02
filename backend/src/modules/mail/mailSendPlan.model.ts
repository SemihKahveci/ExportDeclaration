import mongoose, { Schema } from "mongoose";
import type { SummaryDayMode, SummaryRepeat } from "./summarySendPlan.js";

export interface MailSendPlanDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  dayMode: SummaryDayMode;
  customDays: number[];
  firstMinutes: number;
  repeat: SummaryRepeat;
  lastMinutes: number | null;
  cutoffEnabled: boolean;
  cutoffLeadHours: number;
  createdAt: Date;
  updatedAt: Date;
}

const MailSendPlanSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, required: true, unique: true },
    dayMode: { type: String, required: true },
    customDays: { type: [Number], default: [] },
    firstMinutes: { type: Number, required: true },
    repeat: { type: String, required: true },
    lastMinutes: { type: Number, default: null },
    cutoffEnabled: { type: Boolean, default: false },
    cutoffLeadHours: { type: Number, default: 4 }
  },
  { timestamps: true }
);

export const MailSendPlanModel =
  mongoose.models.MailSendPlan ??
  mongoose.model<MailSendPlanDoc>("MailSendPlan", MailSendPlanSchema);
