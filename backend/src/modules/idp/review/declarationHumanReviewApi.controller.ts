import type { Request, Response } from "express";
import {
  getCurrentDeclarationHumanReview,
  listDeclarationHumanReviewAudit,
  submitCurrentDeclarationHumanReview,
} from "./declarationHumanReviewApi.service.js";

export async function getCurrentReview(req: Request, res: Response): Promise<void> {
  const data = await getCurrentDeclarationHumanReview(
    req.auth!.operationalCompanyId,
    req.params.id!,
  );
  res.json({ ok: true, data });
}

export async function getReviewAudit(req: Request, res: Response): Promise<void> {
  const data = await listDeclarationHumanReviewAudit(
    req.auth!.operationalCompanyId,
    req.params.id!,
  );
  res.json({ ok: true, data });
}

export async function postCurrentReview(req: Request, res: Response): Promise<void> {
  const data = await submitCurrentDeclarationHumanReview({
    companyId: req.auth!.operationalCompanyId,
    declarationId: req.params.id!,
    actorUserId: req.auth!.userId,
    body: req.body ?? {},
  });
  res.status(201).json({ ok: true, data });
}
