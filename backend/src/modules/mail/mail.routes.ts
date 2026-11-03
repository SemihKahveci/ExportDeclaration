import { Router, type Request, type Response } from "express";

import { requireAnyCapability, requireSuperAdmin } from "../../common/middlewares/authorization.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { sendMail } from "./mail.service.js";
import { getCompanySummaryPlan, previewSummaryPlan, saveCompanySummaryPlan } from "./mailSendPlan.service.js";
import { remindCustomerGtip, sendDocumentReminder } from "./processMail.service.js";

export const mailRouter = Router();

mailRouter.get(
  "/send-plan",
  requireAnyCapability("mailler.view", "mailler.manage"),
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await getCompanySummaryPlan(req.auth!.operationalCompanyId) });
  })
);

mailRouter.put(
  "/send-plan",
  requireAnyCapability("mailler.manage"),
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await saveCompanySummaryPlan(req.auth!.operationalCompanyId, req.body ?? {}) });
  })
);

mailRouter.post(
  "/send-plan/preview",
  requireAnyCapability("mailler.view", "mailler.manage", "musteriler.edit"),
  asyncHandler(async (req, res) => {
    const data = previewSummaryPlan(req.body ?? {});
    if (data.issues.length > 0) {
      res.status(400).json({ ok: false, error: data.issues[0], issues: data.issues });
      return;
    }
    res.json({ ok: true, data });
  })
);

mailRouter.post(
  "/document-reminder",
  requireAnyCapability("beyanname.write", "dosya_takip.edit", "mailler.manage"),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const data = await sendDocumentReminder(req.auth!.operationalCompanyId, {
      customerId: String(body.customerId ?? ""),
      customerName: String(body.customerName ?? ""),
      reference: String(body.reference ?? ""),
      missingDocuments: Array.isArray(body.missingDocuments)
        ? body.missingDocuments.map((item: unknown) => String(item))
        : [],
      actorUserId: req.auth!.userId,
      mode: "manual"
    });
    res.json({ ok: true, data });
  })
);

mailRouter.post(
  "/gtip-reminder",
  requireAnyCapability("beyanname.write", "gtip_hazirlik.edit", "mailler.manage"),
  asyncHandler(async (req: Request, res: Response) => {
    const declarationId = String(req.body?.declarationId ?? "");
    const data = await remindCustomerGtip(req.auth!.operationalCompanyId, declarationId, req.auth!.userId, { mode: "manual" });
    res.json({ ok: true, data });
  })
);

mailRouter.post(
  "/test",
  requireSuperAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const to = typeof req.body?.to === "string" ? req.body.to.trim() : "";
    if (!to) {
      res.status(400).json({
        success: false,
        message: "to alanı zorunludur."
      });
      return;
    }

    await sendMail({
      to,
      subject: "Export Declaration - SMTP Test",
      html: `
          <h2>Export Declaration</h2>
          <p>SMTP mail sistemi başarıyla çalışıyor.</p>
          <p>Bu mail test amacıyla gönderilmiştir.</p>
        `
    });

    res.json({
      success: true,
      message: "Mail gönderildi."
    });
  })
);
