import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { MaterialRecordModel } from "../material-records/materialRecord.model.js";
import type { OperationMetaDoc } from "./declaration.model.js";
import { releaseHold } from "./operationStatus.js";

export const GTIP_MISSING_MESSAGE =
  "Fatura GTİP’i müşterinin onaylı malzeme kaydında yok. Kaydı ekleyip düzeltin. Dosya GTİP eksik/hatalı durumunda bekliyor.";
export const GTIP_CONFIRM_MESSAGE =
  "Fatura GTİP’i müşterinin onaylı kaydıyla tutuyor. Devam edelim mi, yoksa müşteriden mi isteyelim?";
export const GTIP_ASKED_ACTIVITY =
  "GTİP müşteri kaydıyla tutuyor; müşteriden teyit istendi. Dosya GTİP hazırlıkta bekliyor.";

export type GtipDecision = "continue" | "ask-customer";

export type GtipGoodsLine = {
  hsCode?: string;
  productCode?: string;
  description?: string;
  quantity?: number | null;
  lineTotal?: number | null;
};

export type GtipMaterialRow = {
  materialNo?: string;
  gtipNo?: string;
  status?: string;
};

type GateDeclaration = mongoose.Document & {
  companyId: mongoose.Types.ObjectId;
  normalizedData?: unknown;
  operation?: OperationMetaDoc | null;
};

/** Nokta, boşluk ve diğer ayırıcılar yok sayılır: 86.6661.6666.6666 ile 86666166666666 aynıdır. */
export function normalizeGtipCode(value: unknown): string {
  return String(value ?? "").replace(/[.\s]/g, "").replace(/\D/g, "");
}

function folded(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase("tr-TR");
}

function meaningfulLines(lines: GtipGoodsLine[]): GtipGoodsLine[] {
  return lines.filter((line) => Boolean(
    String(line.hsCode ?? "").trim()
    || String(line.productCode ?? "").trim()
    || String(line.description ?? "").trim()
    || line.quantity != null
    || line.lineTotal != null
  ));
}

export function gtipMatchIsClean(lines: GtipGoodsLine[], records: GtipMaterialRow[]): boolean {
  const present = meaningfulLines(lines);
  if (present.length === 0) return false;
  const verified = records.filter((record) => record.status === "verified");
  return present.every((line) => {
    const hs = normalizeGtipCode(line.hsCode);
    if (hs.length < 4) return false;
    const material = folded(line.productCode);
    if (material) {
      const byMaterial = records.filter((record) => folded(record.materialNo) === material);
      if (byMaterial.length > 0) {
        return byMaterial.some((record) => record.status === "verified" && normalizeGtipCode(record.gtipNo) === hs);
      }
    }
    return verified.some((record) => normalizeGtipCode(record.gtipNo) === hs);
  });
}

async function holdForGtip(
  declaration: GateDeclaration,
  actorUserId: mongoose.Types.ObjectId,
  activity: string,
  status: "gtip-hazirlik" | "gtip-eksik"
): Promise<void> {
  const operation = declaration.operation;
  if (!operation) throw new HttpError(409, "Beyanname operasyon bilgisi bulunmuyor.");
  const from = operation.fileStatus;
  releaseHold(operation);
  operation.fileStatus = status;
  operation.lastActivity = activity;
  operation.returnNotice = "";
  operation.workflowHistory = operation.workflowHistory ?? [];
  operation.workflowHistory.push({
    action: "GTIP_HOLD",
    fromStatus: from,
    toStatus: status,
    actorUserId,
    override: false,
    reason: activity,
    at: new Date()
  });
  declaration.markModified("operation");
  await declaration.save();
}

export async function applyUserGtipGate(
  declaration: GateDeclaration,
  actorUserId: mongoose.Types.ObjectId,
  decision?: GtipDecision
): Promise<"continue" | "held"> {
  const operation = declaration.operation;
  if (!operation) throw new HttpError(409, "Beyanname operasyon bilgisi bulunmuyor.");
  const customerId = operation.customerId ?? "";
  const records = await MaterialRecordModel.find({ companyId: declaration.companyId, customerId })
    .select({ materialNo: 1, gtipNo: 1, status: 1 })
    .lean<GtipMaterialRow[]>();
  const lines = (declaration.normalizedData as { goodsLines?: GtipGoodsLine[] } | undefined)?.goodsLines ?? [];
  if (!gtipMatchIsClean(lines, records)) {
    await holdForGtip(declaration, actorUserId, GTIP_MISSING_MESSAGE, "gtip-eksik");
    throw new HttpError(409, GTIP_MISSING_MESSAGE, "GTIP_NOT_IN_CUSTOMER_DB");
  }
  if (decision === "ask-customer") {
    await holdForGtip(declaration, actorUserId, GTIP_ASKED_ACTIVITY, "gtip-hazirlik");
    return "held";
  }
  if (decision !== "continue") {
    await holdForGtip(declaration, actorUserId, GTIP_CONFIRM_MESSAGE, "gtip-hazirlik");
    throw new HttpError(409, GTIP_CONFIRM_MESSAGE, "GTIP_MATCH_CONFIRM");
  }
  return "continue";
}
