import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { DeclarationModel, type ApprovalWorkflowStatus } from "./declaration.model.js";
import { toDeclarationDto } from "./declaration.mapper.js";

export type ApprovalAction =
  | "SET_SECOND_APPROVAL_REQUIRED"
  | "SAVE_NOTE"
  | "APPROVE"
  | "RETURN_TO_MT";

function currentStatus(raw?: ApprovalWorkflowStatus): ApprovalWorkflowStatus {
  return raw ?? "FIRST_PENDING";
}

export async function transitionApprovalWorkflow(
  companyId: mongoose.Types.ObjectId,
  declarationId: string,
  actorUserId: mongoose.Types.ObjectId,
  input: { action?: ApprovalAction; note?: string; requiresSecondApproval?: boolean }
) {
  if (!mongoose.isValidObjectId(declarationId)) throw new HttpError(400,"Geçersiz beyanname id.");
  const declaration=await DeclarationModel.findOne({_id:declarationId,companyId});
  if(!declaration) throw new HttpError(404,"Beyanname bulunamadı.");

  const action=input.action;
  if(!action) throw new HttpError(400,"Workflow action gerekli.");

  const wf=declaration.approvalWorkflow ?? {
    status:"FIRST_PENDING" as ApprovalWorkflowStatus,
    requiresSecondApproval:false,
    note:"",
    history:[],
    updatedAt:new Date()
  };
  const from=currentStatus(wf.status);
  let to=from;
  let historyNote=(input.note??"").trim();

  if(action==="SAVE_NOTE"){
    wf.note=historyNote;
  } else if(action==="SET_SECOND_APPROVAL_REQUIRED"){
    if(from!=="FIRST_PENDING") throw new HttpError(409,"İkinci onay gereksinimi yalnız ilk onay aşamasında değiştirilebilir.");
    wf.requiresSecondApproval=Boolean(input.requiresSecondApproval);
  } else if(action==="APPROVE"){
    if(from==="APPROVED") throw new HttpError(409,"Beyanname zaten onaylandı.");
    if(from==="RETURNED") throw new HttpError(409,"MT kontrole geri gönderilen beyanname yeniden onaya sunulmadan onaylanamaz.");
    if(from==="FIRST_PENDING" && wf.requiresSecondApproval) to="SECOND_PENDING";
    else if(from==="FIRST_PENDING" || from==="SECOND_PENDING") to="APPROVED";
    else throw new HttpError(409,"Bu aşamada onay verilemez.");
  } else if(action==="RETURN_TO_MT"){
    if(from!=="FIRST_PENDING" && from!=="SECOND_PENDING") throw new HttpError(409,"Yalnız onay bekleyen beyanname MT kontrole geri gönderilebilir.");
    to="RETURNED";
  }

  wf.status=to;
  wf.updatedAt=new Date();
  wf.history.push({action,fromStatus:from,toStatus:to,actorUserId,note:historyNote,at:new Date()});
  declaration.approvalWorkflow=wf;
  declaration.markModified("approvalWorkflow");

  if(to==="APPROVED"){
    if(declaration.operation){
      declaration.operation.fileStatus="tescil";
      declaration.operation.lastActivity="Beyanname onaylandı; tescile gönderildi";
      declaration.markModified("operation");
    }
  } else if(to==="RETURNED"){
    if(declaration.operation){
      declaration.operation.fileStatus="ic-kontrol";
      declaration.operation.lastActivity="Beyanname MT kontrole geri gönderildi";
      declaration.markModified("operation");
    }
  }

  await declaration.save();
  return toDeclarationDto(declaration);
}
