import type { Request, Response } from "express";
import {
  createDocumentProcess,
  deleteDocumentProcess,
  listDocumentProcesses,
  updateDocumentProcess
} from "./documentProcess.service.js";

export async function getProcesses(req: Request, res: Response): Promise<void> {
  const data = await listDocumentProcesses(req.auth!.operationalCompanyId);
  res.json({ ok: true, data });
}

export async function postProcess(req: Request, res: Response): Promise<void> {
  const data = await createDocumentProcess(req.auth!.operationalCompanyId, req.body ?? {});
  res.status(201).json({ ok: true, data });
}

export async function patchProcess(req: Request, res: Response): Promise<void> {
  const data = await updateDocumentProcess(req.auth!.operationalCompanyId, req.params.id!, req.body ?? {});
  res.json({ ok: true, data });
}

export async function deleteProcess(req: Request, res: Response): Promise<void> {
  await deleteDocumentProcess(req.auth!.operationalCompanyId, req.params.id!);
  res.json({ ok: true, data: { deleted: true } });
}
