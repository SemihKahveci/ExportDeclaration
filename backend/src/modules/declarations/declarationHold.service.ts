import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { DeclarationModel } from "./declaration.model.js";
import { toDeclarationDto } from "./declaration.mapper.js";

export type HoldAction = "HOLD" | "RESUME";

export async function transitionFileHold(
  companyId: mongoose.Types.ObjectId,
  declarationId: string,
  actorUserId: mongoose.Types.ObjectId,
  input: { action?: HoldAction; note?: string }
) {
  if (!mongoose.isValidObjectId(declarationId)) throw new HttpError(400, "Geçersiz beyanname id.");
  const declaration = await DeclarationModel.findOne({ _id: declarationId, companyId });
  if (!declaration) throw new HttpError(404, "Beyanname bulunamadı.");
  const operation = declaration.operation;
  if (!operation) throw new HttpError(409, "Beyanname operasyon bilgisi bulunmuyor.");
  if (operation.isArchived || operation.fileStatus === "kapandi") {
    throw new HttpError(409, "Kapanmış dosya beklemeye alınamaz.");
  }

  const action = input.action;
  if (action === "HOLD") {
    if (operation.fileStatus === "beklemede") throw new HttpError(409, "Dosya zaten beklemede.");
    const note = String(input.note ?? "").trim();
    if (!note) throw new HttpError(400, "Beklemeye almak için not zorunludur.");
    const from = operation.fileStatus;
    operation.holdPreviousStatus = from;
    operation.holdNote = note;
    operation.fileStatus = "beklemede";
    operation.lastActivity = "Dosya beklemeye alındı";
    operation.workflowHistory = operation.workflowHistory ?? [];
    operation.workflowHistory.push({
      action: "HOLD",
      fromStatus: from,
      toStatus: "beklemede",
      actorUserId,
      override: false,
      reason: note,
      at: new Date()
    });
  } else if (action === "RESUME") {
    if (operation.fileStatus !== "beklemede") throw new HttpError(409, "Yalnız beklemedeki dosya devam ettirilebilir.");
    const previous = operation.holdPreviousStatus?.trim();
    if (!previous) throw new HttpError(409, "Dosyanın önceki statüsü bulunamadı.");
    operation.fileStatus = previous;
    operation.holdPreviousStatus = "";
    operation.holdNote = "";
    operation.lastActivity = "Bekleme bitti; dosya önceki statüye döndü";
    operation.workflowHistory = operation.workflowHistory ?? [];
    operation.workflowHistory.push({
      action: "RESUME",
      fromStatus: "beklemede",
      toStatus: previous,
      actorUserId,
      override: false,
      reason: "",
      at: new Date()
    });
  } else {
    throw new HttpError(400, "Geçersiz bekleme işlemi.");
  }

  declaration.markModified("operation");
  await declaration.save();
  return toDeclarationDto(declaration);
}
