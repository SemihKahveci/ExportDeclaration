import mongoose, { Schema } from "mongoose";
import { KAP_KAYNAKLARI, TASIMA_SEKILLERI } from "./ihracatExcelAyar.types.js";

const KuralSchema = new Schema(
  {
    tasimaSekilleri: {
      type: [String],
      required: true,
      validate: {
        validator: (values: string[]) =>
          Array.isArray(values)
          && values.length > 0
          && values.every((value) => (TASIMA_SEKILLERI as readonly string[]).includes(value)),
      },
    },
    kapKaynak: { type: String, enum: KAP_KAYNAKLARI, required: true, default: "fatura" },
    kapSabit: { type: String, default: "" },
    ambalaj: { type: String, default: "" },
  },
  { _id: true }
);

export interface IhracatExcelGenelAyarDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  kurallar: Array<{
    _id: mongoose.Types.ObjectId;
    tasimaSekilleri: string[];
    kapKaynak: "fatura" | "sabit";
    kapSabit: string;
    ambalaj: string;
  }>;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IhracatExcelMusteriAyarDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  gonderenNo: number;
  gonderenUnvan: string;
  tasimaSekilleri: string[];
  kapKaynak: "fatura" | "sabit";
  kapSabit: string;
  ambalaj: string;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const GenelSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, required: true, unique: true, index: true },
    kurallar: { type: [KuralSchema], default: [] },
    updatedBy: { type: Schema.Types.ObjectId, required: false },
  },
  { timestamps: true }
);

const MusteriSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, required: true, index: true },
    gonderenNo: { type: Number, required: true },
    gonderenUnvan: { type: String, default: "" },
    tasimaSekilleri: {
      type: [String],
      required: true,
      validate: {
        validator: (values: string[]) =>
          Array.isArray(values)
          && values.length > 0
          && values.every((value) => (TASIMA_SEKILLERI as readonly string[]).includes(value)),
      },
    },
    kapKaynak: { type: String, enum: KAP_KAYNAKLARI, required: true, default: "fatura" },
    kapSabit: { type: String, default: "" },
    ambalaj: { type: String, default: "" },
    updatedBy: { type: Schema.Types.ObjectId, required: false },
  },
  { timestamps: true }
);

MusteriSchema.index({ companyId: 1, gonderenNo: 1, tasimaSekilleri: 1 });

export const IhracatExcelGenelAyarModel =
  mongoose.models.IhracatExcelGenelAyar
  ?? mongoose.model<IhracatExcelGenelAyarDoc>("IhracatExcelGenelAyar", GenelSchema);

export const IhracatExcelMusteriAyarModel =
  mongoose.models.IhracatExcelMusteriAyar
  ?? mongoose.model<IhracatExcelMusteriAyarDoc>("IhracatExcelMusteriAyar", MusteriSchema);
