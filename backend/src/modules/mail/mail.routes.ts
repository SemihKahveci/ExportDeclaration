import { Router, type Request, type Response, type NextFunction } from "express";

import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { sendMail } from "./mail.service.js";
import { getCompanySummaryPlan, previewSummaryPlan, saveCompanySummaryPlan } from "./mailSendPlan.service.js";
import { remindCustomerGtip, sendDocumentReminder } from "./processMail.service.js";

export const mailRouter = Router();

mailRouter.get("/send-plan", asyncHandler(async (req, res) => {
  res.json({ ok: true, data: await getCompanySummaryPlan(req.auth!.operationalCompanyId) });
}));

mailRouter.put("/send-plan", asyncHandler(async (req, res) => {
  res.json({ ok: true, data: await saveCompanySummaryPlan(req.auth!.operationalCompanyId, req.body ?? {}) });
}));

mailRouter.post("/send-plan/preview", asyncHandler(async (req, res) => {
  const data = previewSummaryPlan(req.body ?? {});
  if (data.issues.length > 0) {
    res.status(400).json({ ok: false, error: data.issues[0], issues: data.issues });
    return;
  }
  res.json({ ok: true, data });
}));

mailRouter.post(
  "/document-reminder",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
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
      return res.json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }
);

mailRouter.post(
  "/gtip-reminder",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const declarationId = String(req.body?.declarationId ?? "");
      const data = await remindCustomerGtip(req.auth!.operationalCompanyId, declarationId, req.auth!.userId, { mode: "manual" });
      return res.json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }
);

mailRouter.post(
  "/test",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { to } = req.body;

      if (!to) {
        return res.status(400).json({
          success: false,
          message: "to alanı zorunludur."
        });
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

      return res.json({
        success: true,
        message: "Mail gönderildi."
      });
    } catch (error) {
      next(error);
    }
  }
);