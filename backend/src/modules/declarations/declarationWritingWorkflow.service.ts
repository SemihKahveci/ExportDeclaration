import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { DeclarationStatus } from "../../common/enums/declarationStatus.js";
import { DeclarationModel } from "./declaration.model.js";
import { toDeclarationDto } from "./declaration.mapper.js";
import { MaterialRecordModel } from "../material-records/materialRecord.model.js";

export type WritingWorkflowAction="SUBMIT_TO_MT"|"APPROVE_MT";

function gtipDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function gtipRegistered(code: string, known: string[]): boolean {
  return code.length >= 4 && known.some((item) => item === code || item.startsWith(code) || code.startsWith(item));
}

async function assertGoodsGtipsRegistered(
  companyId: mongoose.Types.ObjectId,
  declaration: { operation?: { customerId?: string } | null; normalizedData?: unknown }
): Promise<void> {
  const lines = (declaration.normalizedData as { goodsLines?: Array<{ hsCode?: string }> } | undefined)?.goodsLines ?? [];
  if (!Array.isArray(lines) || lines.length === 0) return;
  const customerId = declaration.operation?.customerId;
  const records = await MaterialRecordModel.find({
    companyId,
    ...(customerId ? { customerId } : {}),
    status: { $ne: "rejected" }
  }).select({ gtipNo: 1 }).lean();
  const known = records.map((row) => gtipDigits(row.gtipNo)).filter(Boolean);
  const missing = lines.flatMap((line, index) => {
    const code = gtipDigits(line?.hsCode);
    return gtipRegistered(code, known) ? [] : [code ? `${index + 1}. kalem ${code}` : `${index + 1}. kalem`];
  });
  if (missing.length > 0) {
    throw new HttpError(
      409,
      `GTİP sistemde kayıtlı değil (${missing.join(", ")}). Parse edilmiş olsa bile onaya gönderilemez.`
    );
  }
}

export async function transitionWritingWorkflow(
 companyId:mongoose.Types.ObjectId,declarationId:string,actorUserId:mongoose.Types.ObjectId,
 input:{action?:WritingWorkflowAction}
){
 if(!mongoose.isValidObjectId(declarationId))throw new HttpError(400,"Geçersiz beyanname id.");
 const declaration=await DeclarationModel.findOne({_id:declarationId,companyId});
 if(!declaration)throw new HttpError(404,"Beyanname bulunamadı.");
 if(!declaration.operation)throw new HttpError(409,"Beyanname operasyon bilgisi bulunmuyor.");
 const action=input.action;
 if(action!=="SUBMIT_TO_MT"&&action!=="APPROVE_MT")throw new HttpError(400,"Geçersiz yazım workflow action.");

 const from=declaration.operation.fileStatus;
 if(action==="SUBMIT_TO_MT"){
   if(from!=="beyanname-yazim")throw new HttpError(409,"Yalnız beyanname yazım aşamasındaki dosya MT kontrole gönderilebilir.");
   declaration.operation.fileStatus="ic-kontrol";
   declaration.operation.lastActivity="Beyanname MT kontrole gönderildi";
 }else{
   if(from!=="ic-kontrol")throw new HttpError(409,"Yalnız MT kontrol aşamasındaki dosya onaya gönderilebilir.");
   await assertGoodsGtipsRegistered(companyId, declaration);
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
 declaration.operation.workflowHistory.push({
   action: action as any,fromStatus:from,toStatus:action==="SUBMIT_TO_MT"?"ic-kontrol":"ic-kontrol",
   actorUserId,override:false,reason:"",at:new Date()
 } as any);
 declaration.markModified("operation");
 await declaration.save();
 return toDeclarationDto(declaration);
}
