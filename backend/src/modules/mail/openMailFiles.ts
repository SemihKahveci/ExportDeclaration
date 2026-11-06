import mongoose from "mongoose";
import { DeclarationModel } from "../declarations/declaration.model.js";

export type OpenMailFile = {
  _id: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
  normalizedData?: unknown;
  operation?: {
    ref?: string;
    customerId?: string;
    customerName?: string;
    declarationNo?: string | null;
    fileStatus?: string;
    operationType?: string;
    transportMode?: string | null;
    cutoffAt?: Date | null;
    isArchived?: boolean;
    tescilNo?: string | null;
    receivedAt?: Date;
    workflowHistory?: Array<{ action?: string; toStatus?: string; at?: Date }>;
  } | null;
};

/** Mail tick'inde bir kez yüklenir; hatırlatma / özet / cut-off aynı kümeden süzülür. */
export async function loadOpenMailFiles(): Promise<OpenMailFile[]> {
  return DeclarationModel.find({
    "operation.isArchived": { $ne: true },
    "operation.fileStatus": { $nin: ["kapandi"] }
  })
    .select({ companyId: 1, createdAt: 1, updatedAt: 1, operation: 1, normalizedData: 1 })
    .lean<OpenMailFile[]>();
}

export function withCustomer(files: OpenMailFile[]): OpenMailFile[] {
  return files.filter((file) => Boolean(file.operation?.customerId?.trim()));
}

export function withCutoff(files: OpenMailFile[]): OpenMailFile[] {
  return withCustomer(files).filter((file) => Boolean(file.operation?.cutoffAt));
}
