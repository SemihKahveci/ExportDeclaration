import type { Request, Response } from "express";
import { createAppUser, deleteAppUser, listAppUsers, listAssignableUsers, updateAppUser } from "./user.service.js";

export async function getUsers(req: Request, res: Response): Promise<void> {
  const data = await listAppUsers(req.auth!.operationalCompanyId);
  res.json({ ok: true, data });
}

export async function getAssignableUsers(req: Request, res: Response): Promise<void> {
  const data = await listAssignableUsers(req.auth!.operationalCompanyId);
  res.json({ ok: true, data });
}

export async function postUser(req: Request, res: Response): Promise<void> {
  const data = await createAppUser(req.auth!.operationalCompanyId, req.body ?? {});
  res.status(201).json({ ok: true, data });
}

export async function patchUser(req: Request, res: Response): Promise<void> {
  const data = await updateAppUser(req.auth!.operationalCompanyId, req.params.id!, req.body ?? {});
  res.json({ ok: true, data });
}

export async function removeUser(req: Request, res: Response): Promise<void> {
  await deleteAppUser(req.auth!.operationalCompanyId, req.params.id!, req.auth!.userId);
  res.json({ ok: true, data: null });
}
