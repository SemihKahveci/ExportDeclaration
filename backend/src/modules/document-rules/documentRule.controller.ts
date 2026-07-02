import type { Request, Response } from "express";
import {
  createDocumentRule,
  deleteDocumentRule,
  getDocumentRuleStats,
  listDocumentRules,
  toggleDocumentRuleActive,
  updateDocumentRule
} from "./documentRule.service.js";

export async function getRules(req: Request, res: Response): Promise<void> {
  const data = await listDocumentRules(req.auth!.companyId);
  res.json({ ok: true, data });
}

export async function getStats(req: Request, res: Response): Promise<void> {
  const data = await getDocumentRuleStats(req.auth!.companyId);
  res.json({ ok: true, data });
}

export async function postRule(req: Request, res: Response): Promise<void> {
  const data = await createDocumentRule(req.auth!.companyId, req.body ?? {});
  res.status(201).json({ ok: true, data });
}

export async function patchRule(req: Request, res: Response): Promise<void> {
  const data = await updateDocumentRule(req.auth!.companyId, req.params.id!, req.body ?? {});
  res.json({ ok: true, data });
}

export async function patchToggle(req: Request, res: Response): Promise<void> {
  const data = await toggleDocumentRuleActive(req.auth!.companyId, req.params.id!);
  res.json({ ok: true, data });
}

export async function deleteRule(req: Request, res: Response): Promise<void> {
  await deleteDocumentRule(req.auth!.companyId, req.params.id!);
  res.json({ ok: true, data: { deleted: true } });
}
