import type { Request, Response } from "express";
import { createAppUser, listAppUsers, updateAppUser } from "./user.service.js";

export async function getUsers(req: Request, res: Response): Promise<void> {
  const data = await listAppUsers(req.auth!.companyId);
  res.json({ ok: true, data });
}

export async function postUser(req: Request, res: Response): Promise<void> {
  const data = await createAppUser(req.auth!.companyId, req.body ?? {});
  res.status(201).json({ ok: true, data });
}

export async function patchUser(req: Request, res: Response): Promise<void> {
  const data = await updateAppUser(req.auth!.companyId, req.params.id!, req.body ?? {});
  res.json({ ok: true, data });
}
