import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { searchEvrimGonderen } from "../export-code-tables/evrimVeriTables.js";
import {
  IhracatExcelGenelAyarModel,
  IhracatExcelMusteriAyarModel,
} from "./ihracatExcelAyar.model.js";
import type {
  IhracatExcelAyarDto,
  IhracatExcelKuralDto,
  IhracatExcelMusteriKuralDto,
  KapKaynak,
  ResolvedKapAmbalaj,
  TasimaSekli,
} from "./ihracatExcelAyar.types.js";
import { KAP_KAYNAKLARI, TASIMA_SEKILLERI } from "./ihracatExcelAyar.types.js";

function asTasimaList(value: unknown): TasimaSekli[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(400, "En az bir taşıma şekli seçilmelidir.");
  }
  const list = [...new Set(value.map((item) => String(item).trim()))] as TasimaSekli[];
  for (const item of list) {
    if (!(TASIMA_SEKILLERI as readonly string[]).includes(item)) {
      throw new HttpError(400, `Geçersiz taşıma şekli: ${item}`);
    }
  }
  return list;
}

function asKapKaynak(value: unknown): KapKaynak {
  const text = String(value ?? "fatura");
  if (!(KAP_KAYNAKLARI as readonly string[]).includes(text)) {
    throw new HttpError(400, `Geçersiz kap kaynağı: ${text}`);
  }
  return text as KapKaynak;
}

function assertNoDuplicateModes(
  rules: Array<{ id?: string; tasimaSekilleri: TasimaSekli[] }>,
  scope: string
): void {
  const seen = new Map<string, number>();
  for (let index = 0; index < rules.length; index++) {
    const rule = rules[index]!;
    for (const mode of rule.tasimaSekilleri) {
      const owner = seen.get(mode);
      if (owner !== undefined && owner !== index) {
        throw new HttpError(400, `${scope}: "${mode}" birden fazla kuralda seçilemez.`);
      }
      seen.set(mode, index);
    }
  }
}

function toGenelDto(rule: {
  _id: mongoose.Types.ObjectId;
  tasimaSekilleri: string[];
  kapKaynak: KapKaynak;
  kapSabit?: string;
  ambalaj?: string;
}): IhracatExcelKuralDto {
  return {
    id: String(rule._id),
    tasimaSekilleri: rule.tasimaSekilleri as TasimaSekli[],
    kapKaynak: rule.kapKaynak,
    kapSabit: (rule.kapSabit ?? "").trim().toUpperCase(),
    ambalaj: (rule.ambalaj ?? "").trim(),
  };
}

function toMusteriDto(doc: {
  _id: mongoose.Types.ObjectId;
  gonderenNo: number;
  gonderenUnvan?: string;
  tasimaSekilleri: string[];
  kapKaynak: KapKaynak;
  kapSabit?: string;
  ambalaj?: string;
}): IhracatExcelMusteriKuralDto {
  return {
    id: String(doc._id),
    gonderenNo: doc.gonderenNo,
    gonderenUnvan: doc.gonderenUnvan ?? "",
    tasimaSekilleri: doc.tasimaSekilleri as TasimaSekli[],
    kapKaynak: doc.kapKaynak,
    kapSabit: (doc.kapSabit ?? "").trim().toUpperCase(),
    ambalaj: (doc.ambalaj ?? "").trim(),
  };
}

export async function getIhracatExcelAyar(
  companyId: mongoose.Types.ObjectId
): Promise<IhracatExcelAyarDto> {
  const genelDoc = await IhracatExcelGenelAyarModel.findOne({ companyId }).lean() as {
    kurallar?: Array<{
      _id: mongoose.Types.ObjectId;
      tasimaSekilleri: string[];
      kapKaynak: KapKaynak;
      kapSabit?: string;
      ambalaj?: string;
    }>;
  } | null;
  const musteriDocs = await IhracatExcelMusteriAyarModel.find({ companyId }).sort({ gonderenNo: 1, createdAt: 1 }).lean();
  return {
    genel: (genelDoc?.kurallar ?? []).map((rule) => toGenelDto(rule)),
    musteri: musteriDocs.map((doc) => toMusteriDto(doc as never)),
  };
}

export async function replaceGenelKurallar(
  companyId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId | undefined,
  body: { kurallar?: unknown }
): Promise<IhracatExcelAyarDto> {
  if (!Array.isArray(body.kurallar)) throw new HttpError(400, "kurallar dizisi gerekli.");
  const kurallar = body.kurallar.map((raw, index) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const kapKaynak = asKapKaynak(row.kapKaynak);
    const kapSabit = String(row.kapSabit ?? "").trim().toUpperCase();
    if (kapKaynak === "sabit" && !kapSabit) {
      throw new HttpError(400, `Genel kural ${index + 1}: sabit kap kodu gerekli.`);
    }
    return {
      tasimaSekilleri: asTasimaList(row.tasimaSekilleri),
      kapKaynak,
      kapSabit,
      ambalaj: String(row.ambalaj ?? "").trim(),
      id: typeof row.id === "string" ? row.id : undefined,
    };
  });
  assertNoDuplicateModes(kurallar, "Genel değerler");

  await IhracatExcelGenelAyarModel.findOneAndUpdate(
    { companyId },
    {
      $set: {
        kurallar: kurallar.map(({ tasimaSekilleri, kapKaynak, kapSabit, ambalaj }) => ({
          tasimaSekilleri,
          kapKaynak,
          kapSabit,
          ambalaj,
        })),
        updatedBy: userId,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return getIhracatExcelAyar(companyId);
}

export async function upsertMusteriKural(
  companyId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId | undefined,
  body: Record<string, unknown>
): Promise<IhracatExcelAyarDto> {
  const gonderenNo = Number(body.gonderenNo);
  if (!Number.isFinite(gonderenNo) || gonderenNo <= 0) {
    throw new HttpError(400, "Geçerli müşteri Evrim ID (gonderenNo) gerekli.");
  }
  const tasimaSekilleri = asTasimaList(body.tasimaSekilleri);
  const kapKaynak = asKapKaynak(body.kapKaynak);
  const kapSabit = String(body.kapSabit ?? "").trim().toUpperCase();
  if (kapKaynak === "sabit" && !kapSabit) {
    throw new HttpError(400, "Sabit kap kodu gerekli.");
  }
  const ambalaj = String(body.ambalaj ?? "").trim();
  const id = typeof body.id === "string" && body.id ? body.id : undefined;

  const others = await IhracatExcelMusteriAyarModel.find({
    companyId,
    gonderenNo,
    ...(id ? { _id: { $ne: id } } : {}),
  }).lean();
  assertNoDuplicateModes(
    [
      ...others.map((doc) => ({
        id: String(doc._id),
        tasimaSekilleri: doc.tasimaSekilleri as TasimaSekli[],
      })),
      { id: id ?? "__new__", tasimaSekilleri },
    ],
    `Müşteri ${gonderenNo}`
  );

  const fromLookup = searchEvrimGonderen(String(gonderenNo), 1)[0];
  const gonderenUnvan = String(body.gonderenUnvan ?? fromLookup?.unvan ?? "").trim();

  if (id) {
    const updated = await IhracatExcelMusteriAyarModel.findOneAndUpdate(
      { _id: id, companyId },
      {
        $set: {
          gonderenNo,
          gonderenUnvan,
          tasimaSekilleri,
          kapKaynak,
          kapSabit,
          ambalaj,
          updatedBy: userId,
        },
      },
      { new: true }
    );
    if (!updated) throw new HttpError(404, "Müşteri kuralı bulunamadı.");
  } else {
    await IhracatExcelMusteriAyarModel.create({
      companyId,
      gonderenNo,
      gonderenUnvan,
      tasimaSekilleri,
      kapKaynak,
      kapSabit,
      ambalaj,
      updatedBy: userId,
    });
  }
  return getIhracatExcelAyar(companyId);
}

export async function deleteMusteriKural(
  companyId: mongoose.Types.ObjectId,
  ruleId: string
): Promise<IhracatExcelAyarDto> {
  if (!mongoose.isValidObjectId(ruleId)) throw new HttpError(400, "Geçersiz kural id.");
  const deleted = await IhracatExcelMusteriAyarModel.findOneAndDelete({ _id: ruleId, companyId });
  if (!deleted) throw new HttpError(404, "Müşteri kuralı bulunamadı.");
  return getIhracatExcelAyar(companyId);
}

/** Beyanname indirirken K/W için öncelik: müşteri kuralı → genel kural. */
export async function resolveKapAmbalajForExport(params: {
  companyId: mongoose.Types.ObjectId;
  gonderenNo?: number | null;
  tasimaSekli?: string | null;
}): Promise<ResolvedKapAmbalaj> {
  const mode = String(params.tasimaSekli ?? "").trim() as TasimaSekli;
  if (!(TASIMA_SEKILLERI as readonly string[]).includes(mode)) {
    return {
      kapKaynak: "fatura",
      kapSabit: "",
      ambalaj: "",
      source: "none",
      sourceLabel: "Kural yok · kap faturadan, ambalaj boş",
    };
  }

  if (params.gonderenNo && Number.isFinite(params.gonderenNo)) {
    const musteri = await IhracatExcelMusteriAyarModel.find({
      companyId: params.companyId,
      gonderenNo: params.gonderenNo,
      tasimaSekilleri: mode,
    }).lean();
    const hit = musteri[0];
    if (hit) {
      return {
        kapKaynak: hit.kapKaynak,
        kapSabit: hit.kapSabit ?? "",
        ambalaj: hit.ambalaj ?? "",
        source: "musteri",
        sourceLabel: `Müşteriye özel ayar · ${mode}`,
      };
    }
  }

  const genel = await IhracatExcelGenelAyarModel.findOne({ companyId: params.companyId }).lean();
  const genelHit = ((genel as { kurallar?: Array<{
    tasimaSekilleri: string[];
    kapKaynak: KapKaynak;
    kapSabit?: string;
    ambalaj?: string;
  }> } | null)?.kurallar ?? []).find((rule) => rule.tasimaSekilleri.includes(mode));
  if (genelHit) {
    return {
      kapKaynak: genelHit.kapKaynak,
      kapSabit: genelHit.kapSabit ?? "",
      ambalaj: genelHit.ambalaj ?? "",
      source: "genel",
      sourceLabel: `Genel ayar · ${mode}`,
    };
  }

  return {
    kapKaynak: "fatura",
    kapSabit: "",
    ambalaj: "",
    source: "none",
    sourceLabel: `${mode} için kural yok · kap faturadan, ambalaj boş`,
  };
}
