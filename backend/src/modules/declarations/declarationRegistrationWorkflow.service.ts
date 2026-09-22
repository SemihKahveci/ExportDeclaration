import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { DeclarationModel } from "./declaration.model.js";
import { toDeclarationDto } from "./declaration.mapper.js";

export type RegistrationWorkflowAction="RECORD_REGISTRATION_STARTED"|"COMPLETE_REGISTRATION";
const LINES=new Set(["Kırmızı","Sarı","Mavi","Yeşil"]);

export async function transitionRegistrationWorkflow(
 companyId:mongoose.Types.ObjectId,declarationId:string,actorUserId:mongoose.Types.ObjectId,
 input:{action?:RegistrationWorkflowAction;tescilNo?:string;line?:string}
){
 if(!mongoose.isValidObjectId(declarationId))throw new HttpError(400,"Geçersiz beyanname id.");
 const declaration=await DeclarationModel.findOne({_id:declarationId,companyId});
 if(!declaration)throw new HttpError(404,"Beyanname bulunamadı.");
 const op=declaration.operation;
 if(!op)throw new HttpError(409,"Beyanname operasyon bilgisi bulunmuyor.");
 if(op.fileStatus!=="tescil")throw new HttpError(409,"Yalnız tescil aşamasındaki beyanname güncellenebilir.");

 const action=input.action;
 if(action==="RECORD_REGISTRATION_STARTED"){
   if(op.tescilStatus==="started"||op.tescilStatus==="completed")throw new HttpError(409,"Tescil başlangıç bildirimi daha önce kaydedilmiş.");
   const no=String(input.tescilNo??"").trim();
   const line=String(input.line??"").trim();
   if(!no)throw new HttpError(400,"Tescil numarası zorunludur.");
   if(!LINES.has(line))throw new HttpError(400,"Geçerli hat bilgisi zorunludur.");
   op.tescilNo=no; op.declarationNo=no; op.line=line;
   op.tescilStatus="started"; op.hasSecondNotif=false;
   op.tescilDurumu="Başladı"; op.lastActivity="Tescil başlangıç bildirimi kaydedildi";
 }else if(action==="COMPLETE_REGISTRATION"){
   if(op.tescilStatus!=="started")throw new HttpError(409,"Tescil tamamlanmadan önce başlangıç bildirimi kaydedilmelidir.");
   op.tescilStatus="completed"; op.hasSecondNotif=true; op.tescilDurumu="Tamamlandı";
   op.fileStatus="kapanis-bekleyen"; op.kapanisStatus=op.kapanisStatus??"kontrol-bekliyor";
   op.lastActivity="Tescil tamamlandı; kapanış bekliyor";
 }else throw new HttpError(400,"Geçersiz tescil workflow action.");

 op.workflowHistory=op.workflowHistory??[];
 op.workflowHistory.push({
   action,fromStatus:"tescil",toStatus:action==="COMPLETE_REGISTRATION"?"kapanis-bekleyen":"tescil",
   actorUserId,override:false,reason:"",at:new Date()
 });
 declaration.markModified("operation");
 await declaration.save();
 return toDeclarationDto(declaration);
}
