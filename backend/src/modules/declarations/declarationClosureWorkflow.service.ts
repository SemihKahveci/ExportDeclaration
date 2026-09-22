import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { DeclarationModel } from "./declaration.model.js";
import { toDeclarationDto } from "./declaration.mapper.js";

export async function transitionClosureWorkflow(
  companyId:mongoose.Types.ObjectId,
  declarationId:string,
  actorUserId:mongoose.Types.ObjectId,
  input:{action?:string;note?:string}
){
  if(!mongoose.isValidObjectId(declarationId)) throw new HttpError(400,"Geçersiz beyanname id.");
  const declaration=await DeclarationModel.findOne({_id:declarationId,companyId});
  if(!declaration) throw new HttpError(404,"Beyanname bulunamadı.");
  const op=declaration.operation;
  if(!op) throw new HttpError(409,"Beyanname operasyon bilgisi bulunmuyor.");
  if(input.action!=="CLOSE_FILE") throw new HttpError(400,"Geçersiz kapanış workflow action.");
  if(op.fileStatus!=="kapanis-bekleyen") throw new HttpError(409,"Yalnız kapanış bekleyen dosya kapatılabilir.");
  if(op.tescilStatus!=="completed") throw new HttpError(409,"Tescil tamamlanmadan dosya kapatılamaz.");
  if(op.kapanisStatus==="kapandi") throw new HttpError(409,"Dosya daha önce kapatılmış.");

  const note=String(input.note??"").trim();
  op.workflowHistory=op.workflowHistory??[];
  op.workflowHistory.push({
    action:"CLOSE_FILE",
    fromStatus:"kapanis-bekleyen",
    toStatus:"kapandi",
    actorUserId,
    override:false,
    reason:note,
    at:new Date()
  });
  op.kapanisStatus="kapandi";
  op.kapanicDurumu="Kapandı";
  op.fileStatus="kapandi";
  op.isArchived=true;
  op.closedAt=new Date();
  op.lastActivity="Dosya kapatıldı";
  declaration.markModified("operation");
  await declaration.save();
  return toDeclarationDto(declaration);
}
