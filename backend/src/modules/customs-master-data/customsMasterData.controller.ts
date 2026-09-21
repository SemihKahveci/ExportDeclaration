import type { Request, Response } from "express";
import {createCustomsMasterData,deleteCustomsMasterData,listCustomsMasterData,previewEffectiveCustomsMasterData,updateCustomsMasterData} from "./customsMasterData.service.js";
export async function getRecords(req:Request,res:Response){res.json({ok:true,data:await listCustomsMasterData(req.auth!.operationalCompanyId,{customerId:typeof req.query.customerId==="string"?req.query.customerId:undefined,scope:typeof req.query.scope==="string"?req.query.scope:undefined,key:typeof req.query.key==="string"?req.query.key:undefined})});}
export async function postRecord(req:Request,res:Response){res.status(201).json({ok:true,data:await createCustomsMasterData(req.auth!.operationalCompanyId,req.body??{})});}
export async function patchRecord(req:Request,res:Response){res.json({ok:true,data:await updateCustomsMasterData(req.auth!.operationalCompanyId,req.params.id!,req.body??{})});}
export async function deleteRecord(req:Request,res:Response){await deleteCustomsMasterData(req.auth!.operationalCompanyId,req.params.id!);res.json({ok:true,data:{deleted:true}});}

export async function getEffectivePreview(req:Request,res:Response){
 res.json({ok:true,data:await previewEffectiveCustomsMasterData(req.auth!.operationalCompanyId,{
  customerId:typeof req.query.customerId==="string"?req.query.customerId:undefined,
  productCode:typeof req.query.productCode==="string"?req.query.productCode:undefined,
  hsCode:typeof req.query.hsCode==="string"?req.query.hsCode:undefined,
 })});
}
