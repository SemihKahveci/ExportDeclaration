import type { Request, Response } from "express";
import {
  getDeclarationApprovalRules,
  upsertDeclarationApprovalRules
} from "./declarationApprovalRules.service.js";

export async function getRules(req: Request, res: Response): Promise<void> {
  const data = await getDeclarationApprovalRules(req.auth!.companyId);
  res.json({ ok: true, data });
}

export async function putRules(req: Request, res: Response): Promise<void> {
  const data = await upsertDeclarationApprovalRules(req.auth!.companyId, req.body ?? {});
  res.json({ ok: true, data });
}
