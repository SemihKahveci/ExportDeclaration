import type { Request,Response } from "express";
import { appendCustomsSupplementDecision,listCustomsSupplementDecisions,resolvePersistentCustomsSupplements } from "./customsSupplement.service.js";
export async function list(req:Request,res:Response){res.json({ok:true,data:await listCustomsSupplementDecisions(req.auth!.operationalCompanyId,req.params.id!)});}
export async function append(req:Request,res:Response){
 const actor:any={userId:(req.auth as any)?.userId,email:(req.auth as any)?.email};
 res.status(201).json({ok:true,data:await appendCustomsSupplementDecision(req.auth!.operationalCompanyId,req.params.id!,req.body??{},actor)});
}
export async function effective(req:Request,res:Response){res.json({ok:true,data:await resolvePersistentCustomsSupplements(req.auth!.operationalCompanyId,req.params.id!)});}
