import type { Request, Response } from "express";
import { appendHumanReviewDecision, getHumanReviewCase, getLatestHumanReviewCase, listHumanReviewDecisions } from "./humanReview.service.js";

export async function getLatestReview(req: Request, res: Response): Promise<void> {
  const data = await getLatestHumanReviewCase(req.auth!.operationalCompanyId, req.params.id!);
  res.json({ ok: true, data });
}

export async function getReview(req: Request, res: Response): Promise<void> {
  const data = await getHumanReviewCase(req.auth!.operationalCompanyId, req.params.runId!, req.params.id!);
  res.json({ ok: true, data });
}

export async function getDecisions(req: Request, res: Response): Promise<void> {
  const data = await listHumanReviewDecisions(req.auth!.operationalCompanyId, req.params.runId!, req.params.id!);
  res.json({ ok: true, data });
}

export async function postDecision(req: Request, res: Response): Promise<void> {
  const data = await appendHumanReviewDecision({
    companyId: req.auth!.operationalCompanyId,
    processingRunId: req.params.runId!,
    userId: req.auth!.userId,
    declarationId: req.params.id!,
    body: req.body ?? {}
  });
  res.status(201).json({ ok: true, data });
}
