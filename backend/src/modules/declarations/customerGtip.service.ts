import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { MaterialRecordModel } from "../material-records/materialRecord.model.js";
import type { OperationMetaDoc } from "./declaration.model.js";
import { releaseHold } from "./operationStatus.js";

export const GTIP_MISSING_MESSAGE =
  "Fatura GTİP’i müşterinin onaylı malzeme kaydında yok. Kaydı ekleyip onaylayın. Dosya GTİP hazırlıkta bekliyor.";
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

function digits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
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
    const hs = digits(line.hsCode);
    if (hs.length < 4) return false;
    const material = folded(line.productCode);
    if (material) {
      const byMaterial = records.filter((record) => folded(record.materialNo) === material);
      if (byMaterial.length > 0) {
        return byMaterial.some((record) => record.status === "verified" && digits(record.gtipNo) === hs);
      }
    }
    return verified.some((record) => digits(record.gtipNo) === hs);
  });
}

async function holdForGtip(
  declaration: GateDeclaration,
  actorUserId: mongoose.Types.ObjectId,
  activity: string
): Promise<void> {
  const operation = declaration.operation;
  if (!operation) throw new HttpError(409, "Beyanname operasyon bilgisi bulunmuyor.");
  const from = operation.fileStatus;
  releaseHold(operation);
  operation.fileStatus = "gtip-hazirlik";
  operation.lastActivity = activity;
  operation.returnNotice = "";
  operation.workflowHistory = operation.workflowHistory ?? [];
  operation.workflowHistory.push({
    action: "GTIP_HOLD",
    fromStatus: from,
    toStatus: "gtip-hazirlik",
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
    await holdForGtip(declaration, actorUserId, GTIP_MISSING_MESSAGE);
    throw new HttpError(409, GTIP_MISSING_MESSAGE, "GTIP_NOT_IN_CUSTOMER_DB");
  }
  if (decision === "ask-customer") {
    await holdForGtip(declaration, actorUserId, GTIP_ASKED_ACTIVITY);
    return "held";
  }
  if (decision !== "continue") {
    throw new HttpError(409, GTIP_CONFIRM_MESSAGE, "GTIP_MATCH_CONFIRM");
  }
  return "continue";
}
