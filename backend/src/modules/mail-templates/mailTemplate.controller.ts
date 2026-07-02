import type { Request, Response } from "express";
import {
  createMailTemplate,
  deleteMailTemplate,
  listMailTemplates,
  updateMailTemplate
} from "./mailTemplate.service.js";

export async function getTemplates(req: Request, res: Response): Promise<void> {
  const data = await listMailTemplates(req.auth!.companyId);
  res.json({ ok: true, data });
}

export async function postTemplate(req: Request, res: Response): Promise<void> {
  const data = await createMailTemplate(req.auth!.companyId, req.body ?? {});
  res.status(201).json({ ok: true, data });
}

export async function patchTemplate(req: Request, res: Response): Promise<void> {
  const data = await updateMailTemplate(req.auth!.companyId, req.params.id!, req.body ?? {});
  res.json({ ok: true, data });
}

export async function deleteTemplate(req: Request, res: Response): Promise<void> {
  await deleteMailTemplate(req.auth!.companyId, req.params.id!);
  res.json({ ok: true, data: { deleted: true } });
}
