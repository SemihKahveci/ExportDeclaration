import type { Request, Response } from "express";
import * as svc from "./customer.service.js";

function cid(req: Request) {
  return req.auth!.companyId;
}

export async function getCustomers(req: Request, res: Response): Promise<void> {
  res.json({ ok: true, data: await svc.listCustomers(cid(req)) });
}

export async function postCustomer(req: Request, res: Response): Promise<void> {
  const data = await svc.createCustomer(cid(req), req.body ?? {});
  res.status(201).json({ ok: true, data });
}

export async function patchCustomer(req: Request, res: Response): Promise<void> {
  const data = await svc.updateCustomer(cid(req), req.params.id!, req.body ?? {});
  res.json({ ok: true, data });
}

export async function deleteCustomer(req: Request, res: Response): Promise<void> {
  await svc.deleteCustomer(cid(req), req.params.id!);
  res.json({ ok: true, data: { deleted: true } });
}

export async function getAddresses(req: Request, res: Response): Promise<void> {
  const data = await svc.listAddresses(cid(req), req.params.customerId!);
  res.json({ ok: true, data });
}

export async function postAddress(req: Request, res: Response): Promise<void> {
  const data = await svc.createAddress(cid(req), req.params.customerId!, req.body ?? {});
  res.status(201).json({ ok: true, data });
}

export async function patchAddress(req: Request, res: Response): Promise<void> {
  const data = await svc.updateAddress(cid(req), req.params.id!, req.body ?? {});
  res.json({ ok: true, data });
}

export async function deleteAddress(req: Request, res: Response): Promise<void> {
  await svc.deleteAddress(cid(req), req.params.id!);
  res.json({ ok: true, data: { deleted: true } });
}

export async function getDomains(req: Request, res: Response): Promise<void> {
  const data = await svc.listDomains(cid(req), req.params.customerId!);
  res.json({ ok: true, data });
}

export async function postDomain(req: Request, res: Response): Promise<void> {
  const data = await svc.createDomain(cid(req), req.params.customerId!, req.body ?? {});
  res.status(201).json({ ok: true, data });
}

export async function patchDomain(req: Request, res: Response): Promise<void> {
  const data = await svc.updateDomain(cid(req), req.params.id!, req.body ?? {});
  res.json({ ok: true, data });
}

export async function deleteDomain(req: Request, res: Response): Promise<void> {
  await svc.deleteDomain(cid(req), req.params.id!);
  res.json({ ok: true, data: { deleted: true } });
}

export async function getMails(req: Request, res: Response): Promise<void> {
  const data = await svc.listMails(cid(req), req.params.customerId!);
  res.json({ ok: true, data });
}

export async function postMail(req: Request, res: Response): Promise<void> {
  const data = await svc.createMail(cid(req), req.params.customerId!, req.body ?? {});
  res.status(201).json({ ok: true, data });
}

export async function patchMail(req: Request, res: Response): Promise<void> {
  const data = await svc.updateMail(cid(req), req.params.id!, req.body ?? {});
  res.json({ ok: true, data });
}

export async function deleteMail(req: Request, res: Response): Promise<void> {
  await svc.deleteMail(cid(req), req.params.id!);
  res.json({ ok: true, data: { deleted: true } });
}

export async function getDocRules(req: Request, res: Response): Promise<void> {
  const data = await svc.listDocumentRules(cid(req), req.params.customerId!);
  res.json({ ok: true, data });
}

export async function postDocRule(req: Request, res: Response): Promise<void> {
  const data = await svc.createDocumentRule(cid(req), req.params.customerId!, req.body ?? {});
  res.status(201).json({ ok: true, data });
}

export async function patchDocRule(req: Request, res: Response): Promise<void> {
  const data = await svc.updateDocumentRule(cid(req), req.params.id!, req.body ?? {});
  res.json({ ok: true, data });
}

export async function deleteDocRule(req: Request, res: Response): Promise<void> {
  await svc.deleteDocumentRule(cid(req), req.params.id!);
  res.json({ ok: true, data: { deleted: true } });
}

export async function getNotifyRules(req: Request, res: Response): Promise<void> {
  const data = await svc.listNotificationRules(cid(req), req.params.customerId!);
  res.json({ ok: true, data });
}

export async function postNotifyRule(req: Request, res: Response): Promise<void> {
  const data = await svc.createNotificationRule(cid(req), req.params.customerId!, req.body ?? {});
  res.status(201).json({ ok: true, data });
}

export async function patchNotifyRule(req: Request, res: Response): Promise<void> {
  const data = await svc.updateNotificationRule(cid(req), req.params.id!, req.body ?? {});
  res.json({ ok: true, data });
}

export async function deleteNotifyRule(req: Request, res: Response): Promise<void> {
  await svc.deleteNotificationRule(cid(req), req.params.id!);
  res.json({ ok: true, data: { deleted: true } });
}

export async function getDeclFieldRules(req: Request, res: Response): Promise<void> {
  const data = await svc.listDeclarationFieldRules(cid(req), req.params.customerId!);
  res.json({ ok: true, data });
}

export async function postDeclFieldRule(req: Request, res: Response): Promise<void> {
  const data = await svc.createDeclarationFieldRule(cid(req), req.params.customerId!, req.body ?? {});
  res.status(201).json({ ok: true, data });
}

export async function patchDeclFieldRule(req: Request, res: Response): Promise<void> {
  const data = await svc.updateDeclarationFieldRule(cid(req), req.params.id!, req.body ?? {});
  res.json({ ok: true, data });
}

export async function deleteDeclFieldRule(req: Request, res: Response): Promise<void> {
  await svc.deleteDeclarationFieldRule(cid(req), req.params.id!);
  res.json({ ok: true, data: { deleted: true } });
}
