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
import { transitionApprovalWorkflow } from "./declarationWorkflow.service.js";
import { transitionPreparationWorkflow } from "./declarationPreparationWorkflow.service.js";
import fs from "node:fs/promises";
import {
  exportDeclarationAsEvrimExcel,
  exportDeclarationAsUnsignedUblIhracat,
  type EvrimExcelExportInput,
  type UblIhracatExportInput
} from "../declaration-exports/declarationExport.service.js";

export async function postDeclaration(req: Request, res: Response): Promise<void> {
  const companyId = req.auth!.operationalCompanyId;
  const created = await createDeclaration(companyId, req.auth!.userId, req.body ?? {});
  res.status(201).json({ ok: true, data: created });
}

export async function getDeclarations(req: Request, res: Response): Promise<void> {
  const list = await listDeclarations(req.auth!.operationalCompanyId);
  res.json({ ok: true, data: list });
}

export async function getDeclarationById(req: Request, res: Response): Promise<void> {
  const row = await getDeclaration(req.auth!.operationalCompanyId, req.params.id!);
  res.json({ ok: true, data: row });
}

export async function patchDeclarationById(req: Request, res: Response): Promise<void> {
  const updated = await patchDeclaration(req.auth!.operationalCompanyId, req.params.id!, req.body ?? {});
  res.json({ ok: true, data: updated });
}

export async function postExtract(req: Request, res: Response): Promise<void> {
  const data = await runExtraction(req.auth!.operationalCompanyId, req.params.id!);
  res.json({ ok: true, data });
}

export async function postNormalize(req: Request, res: Response): Promise<void> {
  const data = await runNormalize(req.auth!.operationalCompanyId, req.params.id!);
  res.json({ ok: true, data });
}

export async function postValidate(req: Request, res: Response): Promise<void> {
  const result = await runValidate(req.auth!.operationalCompanyId, req.params.id!);
  res.json({ ok: true, data: result });
}

export async function postGenerateXml(req: Request, res: Response): Promise<void> {
  const out = await runGenerateXml(req.auth!.operationalCompanyId, req.params.id!);
  res.json({ ok: true, data: out });
}

export async function getDownloadXml(req: Request, res: Response): Promise<void> {
  const filePath = await getGeneratedXmlPath(req.auth!.operationalCompanyId, req.params.id!);
  const buf = await fs.readFile(filePath);
  res.setHeader("Content-Type", "application/xml");
  res.setHeader("Content-Disposition", `attachment; filename="beyanname.xml"`);
  res.send(buf);
}

export async function postExportEvrimExcel(req: Request, res: Response): Promise<void> {
  const result = await exportDeclarationAsEvrimExcel(
    req.auth!.operationalCompanyId,
    req.params.id!,
    (req.body ?? {}) as EvrimExcelExportInput
  );

  if (!result.ready) {
    res.status(409).json({
      ok: false,
      code: "EXPORT_NOT_READY",
      issues: result.issues
    });
    return;
  }

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
  res.setHeader("X-Export-Row-Count", String(result.rowCount));
  res.send(result.buffer);
}


export async function postExportUblIhracat(req: Request, res: Response): Promise<void> {
  const result = await exportDeclarationAsUnsignedUblIhracat(
    req.auth!.operationalCompanyId,
    req.params.id!,
    (req.body ?? {}) as UblIhracatExportInput
  );

  if (!result.ready) {
    res.status(409).json({
      ok: false,
      code: "EXPORT_NOT_READY",
      issues: result.issues
    });
    return;
  }

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
  res.setHeader("X-Export-Row-Count", String(result.lineCount));
  res.setHeader("X-UBL-Profile", result.profileId);
  res.setHeader("X-UBL-Signed", String(result.signed));
  res.send(result.buffer);
}

export async function postApprovalWorkflowTransition(req: Request, res: Response): Promise<void> {
  const data=await transitionApprovalWorkflow(
    req.auth!.operationalCompanyId,
    req.params.id!,
    req.auth!.userId,
    req.body??{}
  );
  res.json({ok:true,data});
}

export async function postPreparationWorkflowTransition(req: Request, res: Response): Promise<void> {
  const data=await transitionPreparationWorkflow(req.auth!.operationalCompanyId,req.params.id!,req.auth!.userId,req.body??{});
  res.json({ok:true,data});
}
