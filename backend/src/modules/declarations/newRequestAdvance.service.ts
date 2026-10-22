import mongoose from "mongoose";
import { DeclarationModel } from "./declaration.model.js";
import { missingDocumentsByDeclaration } from "./declaration.service.js";
import { UploadedDocumentModel } from "../documents/document.model.js";
import { MaterialRecordModel } from "../material-records/materialRecord.model.js";

export const NEW_REQUEST_LIMIT_MS = 15 * 60 * 1000;
const TICK_MS = 30 * 1000;

type GoodsLine = {
  hsCode?: string;
  productCode?: string;
  description?: string;
  quantity?: number | null;
  lineTotal?: number | null;
};

type MaterialRow = {
  companyId: mongoose.Types.ObjectId;
  customerId: string;
  materialNo: string;
  gtipNo: string;
  status: string;
};

type AdvanceTarget = "evrak-bekleniyor" | "gtip-hazirlik" | "beyanname-yazim";

function digits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function folded(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase("tr-TR");
}

function sameGtip(left: string, right: string): boolean {
  return left.length > 0 && left === right;
}

function meaningfulLines(lines: GoodsLine[]): GoodsLine[] {
  return lines.filter((line) => {
    return Boolean(
      String(line.hsCode ?? "").trim()
      || String(line.productCode ?? "").trim()
      || String(line.description ?? "").trim()
      || line.quantity != null
      || line.lineTotal != null
    );
  });
}

export function gtipMatchIsClean(lines: GoodsLine[], records: MaterialRow[]): boolean {
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
        return byMaterial.some((record) => record.status === "verified" && sameGtip(hs, digits(record.gtipNo)));
      }
    }
    return verified.some((record) => sameGtip(hs, digits(record.gtipNo)));
  });
}

function documentsReady(statuses: string[], missing: string[]): boolean {
  return missing.length === 0 && statuses.length > 0 && statuses.every((status) => status === "SUCCESS");
}

export function decideNewRequestAdvance(input: {
  missingDocuments: string[];
  extractionStatuses: string[];
  lines: GoodsLine[];
  records: MaterialRow[];
}): { status: AdvanceTarget; activity: string } {
  if (!documentsReady(input.extractionStatuses, input.missingDocuments)) {
    const activity = input.missingDocuments.length > 0
      ? "15 dakika doldu; eksik evrak bekleniyor."
      : "15 dakika doldu; evraklar henüz yazıma hazır değil.";
    return { status: "evrak-bekleniyor", activity };
  }
  if (!gtipMatchIsClean(input.lines, input.records)) {
    return {
      status: "gtip-hazirlik",
      activity: "15 dakika doldu; fatura GTİP’i müşterinin onaylı kaydıyla birebir tutmuyor. GTİP hazırlıkta bekliyor."
    };
  }
  return {
    status: "beyanname-yazim",
    activity: "15 dakika doldu; evraklar hazır ve GTİP onaylı kayıtla tutuyor. Beyanname yazımına alındı."
  };
}

export async function advanceExpiredNewRequests(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - NEW_REQUEST_LIMIT_MS);
  const files = await DeclarationModel.find({
    "operation.fileStatus": "yeni-talep",
    "operation.isArchived": { $ne: true },
    "operation.receivedAt": { $lte: cutoff }
  }).select({ companyId: 1, createdBy: 1, normalizedData: 1, operation: 1 });

  if (files.length === 0) return 0;

  const byCompany = new Map<string, typeof files>();
  for (const file of files) {
    const key = String(file.companyId);
    const group = byCompany.get(key) ?? [];
    group.push(file);
    byCompany.set(key, group);
  }

  let moved = 0;
  for (const [companyKey, group] of byCompany) {
    const companyId = new mongoose.Types.ObjectId(companyKey);
    const customerIds = [...new Set(group.map((file) => file.operation?.customerId).filter((id): id is string => Boolean(id)))];
    const [missingByFile, documents, records] = await Promise.all([
      missingDocumentsByDeclaration(companyId, group),
      UploadedDocumentModel.find({ companyId, declarationId: { $in: group.map((file) => file._id) } })
        .select({ declarationId: 1, extractionStatus: 1 })
        .lean(),
      MaterialRecordModel.find({ companyId, customerId: { $in: customerIds } })
        .select({ companyId: 1, customerId: 1, materialNo: 1, gtipNo: 1, status: 1 })
        .lean<MaterialRow[]>()
    ]);

    const statusesByFile = new Map<string, string[]>();
    for (const document of documents) {
      const id = String(document.declarationId);
      const statuses = statusesByFile.get(id) ?? [];
      statuses.push(String(document.extractionStatus ?? ""));
      statusesByFile.set(id, statuses);
    }

    for (const file of group) {
      const id = String(file._id);
      const customerId = file.operation?.customerId ?? "";
      const customerRecords = records.filter((record) => String(record.customerId) === customerId);
      const lines = ((file.normalizedData as { goodsLines?: GoodsLine[] } | null | undefined)?.goodsLines ?? []);
      const decision = decideNewRequestAdvance({
        missingDocuments: missingByFile.get(id) ?? [],
        extractionStatuses: statusesByFile.get(id) ?? [],
        lines,
        records: customerRecords
      });
      const history: {
        action: "AUTO_ADVANCE";
        fromStatus: "yeni-talep";
        toStatus: AdvanceTarget;
        override: false;
        reason: string;
        at: Date;
        actorUserId?: mongoose.Types.ObjectId;
      } = {
        action: "AUTO_ADVANCE",
        fromStatus: "yeni-talep",
        toStatus: decision.status,
        override: false,
        reason: decision.activity,
        at: now
      };
      if (file.createdBy) history.actorUserId = file.createdBy;

      const updated = await DeclarationModel.updateOne(
        { _id: file._id, companyId, "operation.fileStatus": "yeni-talep" },
        {
          $set: {
            "operation.fileStatus": decision.status,
            "operation.lastActivity": decision.activity
          },
          $push: { "operation.workflowHistory": history }
        }
      );
      if (updated.modifiedCount > 0) moved += 1;
    }
  }

  return moved;
}

let running = false;

export function startNewRequestAdvanceJob(): void {
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const moved = await advanceExpiredNewRequests();
      if (moved > 0) {
        console.log(JSON.stringify({ event: "new-request.advance", moved }));
      }
    } catch (error) {
      console.error(JSON.stringify({
        event: "new-request.advance.failed",
        message: error instanceof Error ? error.message : "Yeni talep geçişi başarısız"
      }));
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => {
    void tick();
  }, TICK_MS);
  timer.unref();
}
