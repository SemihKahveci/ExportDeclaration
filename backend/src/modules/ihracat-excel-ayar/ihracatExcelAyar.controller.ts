import type { Request, Response } from "express";
import {
  deleteMusteriKural,
  getIhracatExcelAyar,
  replaceGenelKurallar,
  resolveKapAmbalajForExport,
  upsertMusteriKural,
} from "./ihracatExcelAyar.service.js";

export async function getAyar(req: Request, res: Response): Promise<void> {
  const data = await getIhracatExcelAyar(req.auth!.operationalCompanyId);
  res.json(data);
}

export async function putGenel(req: Request, res: Response): Promise<void> {
  const data = await replaceGenelKurallar(
    req.auth!.operationalCompanyId,
    req.auth!.userId,
    (req.body ?? {}) as { kurallar?: unknown }
  );
  res.json(data);
}

export async function putMusteri(req: Request, res: Response): Promise<void> {
  const data = await upsertMusteriKural(
    req.auth!.operationalCompanyId,
    req.auth!.userId,
    (req.body ?? {}) as Record<string, unknown>
  );
  res.json(data);
}

export async function removeMusteri(req: Request, res: Response): Promise<void> {
  const data = await deleteMusteriKural(req.auth!.operationalCompanyId, req.params.id!);
  res.json(data);
}

export async function postResolve(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as { gonderenNo?: number; tasimaSekli?: string };
  const data = await resolveKapAmbalajForExport({
    companyId: req.auth!.operationalCompanyId,
    gonderenNo: body.gonderenNo,
    tasimaSekli: body.tasimaSekli,
  });
  res.json(data);
}
