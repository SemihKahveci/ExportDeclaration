import type { Request, Response } from "express";
import {
  createEvrakRule,
  deleteEvrakRule,
  getEvrakRuleStats,
  listEvrakRules,
  toggleEvrakRuleActive,
  updateEvrakRule
} from "./evrakRule.service.js";

export async function getRules(req: Request, res: Response): Promise<void> {
  const data = await listEvrakRules(req.auth!.companyId);
  res.json({ ok: true, data });
}

export async function getStats(req: Request, res: Response): Promise<void> {
  const data = await getEvrakRuleStats(req.auth!.companyId);
  res.json({ ok: true, data });
}

export async function postRule(req: Request, res: Response): Promise<void> {
  const data = await createEvrakRule(req.auth!.companyId, req.body ?? {});
  res.status(201).json({ ok: true, data });
}

export async function patchRule(req: Request, res: Response): Promise<void> {
  const data = await updateEvrakRule(req.auth!.companyId, req.params.id!, req.body ?? {});
  res.json({ ok: true, data });
}

export async function patchToggle(req: Request, res: Response): Promise<void> {
  const data = await toggleEvrakRuleActive(req.auth!.companyId, req.params.id!);
  res.json({ ok: true, data });
}

export async function deleteRule(req: Request, res: Response): Promise<void> {
  await deleteEvrakRule(req.auth!.companyId, req.params.id!);
  res.json({ ok: true, data: { deleted: true } });
}
