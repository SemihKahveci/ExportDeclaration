import type { Request, Response } from "express";
import {
  createDeclaration,
  getDeclaration,
  getGeneratedXmlPath,
  listDeclarations,
  patchDeclaration,
  runExtraction,
  runGenerateXml,
  runNormalize,
  runValidate
} from "./declaration.service.js";
import fs from "node:fs/promises";

export async function postDeclaration(req: Request, res: Response): Promise<void> {
  const companyId = req.auth!.companyId;
  const created = await createDeclaration(companyId, req.auth!.userId);
  res.status(201).json({ ok: true, data: created });
}

export async function getDeclarations(req: Request, res: Response): Promise<void> {
  const list = await listDeclarations(req.auth!.companyId);
  res.json({ ok: true, data: list });
}

export async function getDeclarationById(req: Request, res: Response): Promise<void> {
  const row = await getDeclaration(req.auth!.companyId, req.params.id!);
  res.json({ ok: true, data: row });
}

export async function patchDeclarationById(req: Request, res: Response): Promise<void> {
  const updated = await patchDeclaration(req.auth!.companyId, req.params.id!, req.body ?? {});
  res.json({ ok: true, data: updated });
}

export async function postExtract(req: Request, res: Response): Promise<void> {
  const data = await runExtraction(req.auth!.companyId, req.params.id!);
  res.json({ ok: true, data });
}

export async function postNormalize(req: Request, res: Response): Promise<void> {
  const data = await runNormalize(req.auth!.companyId, req.params.id!);
  res.json({ ok: true, data });
}

export async function postValidate(req: Request, res: Response): Promise<void> {
  const result = await runValidate(req.auth!.companyId, req.params.id!);
  res.json({ ok: true, data: result });
}

export async function postGenerateXml(req: Request, res: Response): Promise<void> {
  const out = await runGenerateXml(req.auth!.companyId, req.params.id!);
  res.json({ ok: true, data: out });
}

export async function getDownloadXml(req: Request, res: Response): Promise<void> {
  const filePath = await getGeneratedXmlPath(req.auth!.companyId, req.params.id!);
  const buf = await fs.readFile(filePath);
  res.setHeader("Content-Type", "application/xml");
  res.setHeader("Content-Disposition", `attachment; filename="beyanname.xml"`);
  res.send(buf);
}
