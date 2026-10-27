import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { DeclarationStatus } from "../../common/enums/declarationStatus.js";
import { DeclarationModel } from "./declaration.model.js";
import { toDeclarationDto } from "./declaration.mapper.js";
import { applyUserGtipGate, type GtipDecision } from "./customerGtip.service.js";
import { actionableFileStatus, releaseHold } from "./operationStatus.js";

export type WritingWorkflowAction="SUBMIT_TO_MT"|"APPROVE_MT"|"RETURN_TO_WRITING";

function parsedGtip(value: unknown): boolean {
  return String(value ?? "").replace(/\D/g, "").length >= 4;
}

function assertParsedGtip(declaration: { normalizedData?: unknown }): void {
  const lines = (declaration.normalizedData as { goodsLines?: Array<{ hsCode?: string }> } | undefined)?.goodsLines;
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new HttpError(409, "GTİP faturada bulunmuyor veya parse edilmedi. Kontrole gönderilemez.");
  }
  const missing = lines.flatMap((line, index) => parsedGtip(line?.hsCode) ? [] : [`${index + 1}. kalem`]);
  if (missing.length > 0) {
    throw new HttpError(
      409,
      `GTİP faturada bulunmuyor veya parse edilmedi (${missing.join(", ")}). Kontrole gönderilemez.`
    );
  }
}

export async function transitionWritingWorkflow(
 companyId:mongoose.Types.ObjectId,declarationId:string,actorUserId:mongoose.Types.ObjectId,
 input:{action?:WritingWorkflowAction;gtipDecision?:GtipDecision;reason?:string}
){
 if(!mongoose.isValidObjectId(declarationId))throw new HttpError(400,"Geçersiz beyanname id.");
 const declaration=await DeclarationModel.findOne({_id:declarationId,companyId});
 if(!declaration)throw new HttpError(404,"Beyanname bulunamadı.");
 if(!declaration.operation)throw new HttpError(409,"Beyanname operasyon bilgisi bulunmuyor.");
 const action=input.action;
 if(action!=="SUBMIT_TO_MT"&&action!=="APPROVE_MT"&&action!=="RETURN_TO_WRITING")throw new HttpError(400,"Geçersiz yazım workflow action.");

 const actualFrom=declaration.operation.fileStatus;
 const from=actionableFileStatus(actualFrom,declaration.operation.holdPreviousStatus);
 if(action==="RETURN_TO_WRITING"){
   if(from!=="ic-kontrol")throw new HttpError(409,"Yalnız iç kontroldeki dosya yazıma geri gönderilebilir.");
   const reason=input.reason?.trim()??"";
   if(!reason)throw new HttpError(400,"Yazıma geri göndermek için not zorunludur.");
   releaseHold(declaration.operation);
   declaration.operation.fileStatus="beyanname-yazim";
   declaration.operation.returnNotice=reason;
   declaration.operation.lastActivity="Beyanname yazıma geri gönderildi";
 }else if(action==="SUBMIT_TO_MT"){
   assertParsedGtip(declaration);
   if(from!=="beyanname-yazim")throw new HttpError(409,"Yalnız beyanname yazım aşamasındaki dosya MT kontrole gönderilebilir.");
   const gate=await applyUserGtipGate(declaration,actorUserId,input.gtipDecision);
   if(gate==="held")return toDeclarationDto(declaration);
   releaseHold(declaration.operation);
   declaration.operation.returnNotice="";
   declaration.operation.fileStatus="ic-kontrol";
   declaration.operation.lastActivity="Beyanname MT kontrole gönderildi";
 }else{
   if(from!=="ic-kontrol")throw new HttpError(409,"Yalnız MT kontrol aşamasındaki dosya onaya gönderilebilir.");
   releaseHold(declaration.operation);
   declaration.operation.fileStatus="ic-kontrol";
   declaration.status=DeclarationStatus.READY;
   declaration.operation.lastActivity="MT kontrol tamamlandı; beyanname onaya hazır";

   const approval=declaration.approvalWorkflow ?? {
     status:"FIRST_PENDING" as const,requiresSecondApproval:false,note:"",history:[],updatedAt:new Date()
   };
   const previous=approval.status;
   if(previous==="SECOND_PENDING"||previous==="APPROVED")throw new HttpError(409,"Aktif veya tamamlanmış onay akışı MT tarafından yeniden başlatılamaz.");
   approval.status="FIRST_PENDING";
   approval.updatedAt=new Date();
   if(previous==="RETURNED"){
     approval.history.push({
       action:"RESUBMIT_FROM_MT",fromStatus:"RETURNED",toStatus:"FIRST_PENDING",
       actorUserId,note:"MT kontrol sonrası yeniden onaya sunuldu",at:new Date()
     });
   }
   declaration.approvalWorkflow=approval;
   declaration.markModified("approvalWorkflow");
 }

 declaration.operation.workflowHistory=declaration.operation.workflowHistory??[];
 const toStatus=action==="RETURN_TO_WRITING"?"beyanname-yazim":"ic-kontrol";
 declaration.operation.workflowHistory.push({
   action,fromStatus:actualFrom,toStatus,
   actorUserId,override:false,reason:action==="RETURN_TO_WRITING"?input.reason?.trim()??"":"",at:new Date()
 });
 declaration.markModified("operation");
 await declaration.save();
 return toDeclarationDto(declaration);
}
