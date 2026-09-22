import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { DeclarationModel } from "./declaration.model.js";
import { UploadedFileModel } from "../documents/document.model.js";
import { toDeclarationDto } from "./declaration.mapper.js";

export type PreparationAction="START_WRITING"|"START_WRITING_WITH_MISSING_DOCUMENTS";

export async function transitionPreparationWorkflow(
 companyId:mongoose.Types.ObjectId,declarationId:string,actorUserId:mongoose.Types.ObjectId,
 input:{action?:PreparationAction;reason?:string}
){
 if(!mongoose.isValidObjectId(declarationId))throw new HttpError(400,"Geçersiz beyanname id.");
 const declaration=await DeclarationModel.findOne({_id:declarationId,companyId});
 if(!declaration)throw new HttpError(404,"Beyanname bulunamadı.");
 if(!declaration.operation)throw new HttpError(409,"Beyanname operasyon bilgisi bulunmuyor.");
 const action=input.action;
 if(action!=="START_WRITING"&&action!=="START_WRITING_WITH_MISSING_DOCUMENTS")throw new HttpError(400,"Geçersiz hazırlık workflow action.");

 const docs=await UploadedFileModel.find({companyId,declarationId:declaration._id}).select("_id extractionStatus fileName").lean();
 const blocking=docs.filter(d=>d.extractionStatus!=="SUCCESS");
 const ready=docs.length>0&&blocking.length===0;
 const override=action==="START_WRITING_WITH_MISSING_DOCUMENTS";
 const reason=(input.reason??"").trim();

 if(!override&&!ready){
   throw new HttpError(409,docs.length===0?"Beyanname yazımı için en az bir işlenmiş evrak gerekli.":`Beyanname yazımı hazır değil: ${blocking.length} evrak başarıyla işlenmedi.`);
 }
 if(override&&!reason)throw new HttpError(400,"Eksik evrakla devam için gerekçe zorunludur.");

 const from=declaration.operation.fileStatus??"evrak-bekleniyor";
 if(["tescil","kapanis-bekleyen","kapandi"].includes(from))throw new HttpError(409,"Bu aşamadaki dosya yeniden beyanname yazımına alınamaz.");

 declaration.operation.fileStatus="beyanname-yazim";
 declaration.operation.lastActivity=override?"Eksik evrak override ile beyanname yazımına alındı":"Evrak kontrolü tamamlandı; beyanname yazımına alındı";
 declaration.operation.workflowHistory=declaration.operation.workflowHistory??[];
 declaration.operation.workflowHistory.push({
   action,fromStatus:from,toStatus:"beyanname-yazim",actorUserId,override,reason,at:new Date()
 });
 declaration.markModified("operation");
 await declaration.save();
 return {
   declaration:toDeclarationDto(declaration),
   readiness:{ready,documentCount:docs.length,blockingDocumentCount:blocking.length,blockingDocuments:blocking.map(d=>({id:String(d._id),fileName:d.fileName??"",status:d.extractionStatus}))}
 };
}
