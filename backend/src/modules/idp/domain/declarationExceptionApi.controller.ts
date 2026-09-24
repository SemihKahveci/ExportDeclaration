import type { Request, Response } from "express";
import mongoose from "mongoose";
import { getCurrentDeclarationExceptions, listDeclarationExceptionAudit } from "./declarationExceptionApi.service.js";

function companyId(req: Request) {
  return new mongoose.Types.ObjectId(req.auth!.operationalCompanyId);
}

export async function getCurrentDeclarationExceptionsController(req: Request, res: Response) {
  try {
    res.json(await getCurrentDeclarationExceptions(companyId(req), req.params.id));
  } catch (error) {
    res.status(409).json({ message: error instanceof Error ? error.message : String(error) });
  }
}

export async function listDeclarationExceptionAuditController(req: Request, res: Response) {
  try {
    res.json(await listDeclarationExceptionAudit(companyId(req), req.params.id));
  } catch (error) {
    res.status(409).json({ message: error instanceof Error ? error.message : String(error) });
  }
}
