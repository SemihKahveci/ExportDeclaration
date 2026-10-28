import mongoose, { Schema } from "mongoose";

export interface DocumentReminderDispatchDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
  ruleId: string;
  slotKey: string;
  sentAt: Date;
}

const DocumentReminderDispatchSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, required: true, index: true },
    declarationId: { type: Schema.Types.ObjectId, required: true, index: true },
    ruleId: { type: String, required: true },
    slotKey: { type: String, required: true },
    sentAt: { type: Date, required: true }
  },
  { timestamps: false }
);

DocumentReminderDispatchSchema.index({ declarationId: 1, ruleId: 1, slotKey: 1 }, { unique: true });

export const DocumentReminderDispatchModel =
  mongoose.models.DocumentReminderDispatch ??
  mongoose.model<DocumentReminderDispatchDoc>("DocumentReminderDispatch", DocumentReminderDispatchSchema);
