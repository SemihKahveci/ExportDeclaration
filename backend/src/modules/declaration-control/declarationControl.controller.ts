import type {Request,Response} from "express";
import {getDeclarationControlProjection} from "./declarationControl.service.js";
export async function getControlProjection(req:Request,res:Response):Promise<void>{res.json({ok:true,data:await getDeclarationControlProjection(req.auth!.operationalCompanyId,req.params.id!)});}
