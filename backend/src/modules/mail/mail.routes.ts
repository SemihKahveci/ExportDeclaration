import { Router, type Request, type Response, type NextFunction } from "express";

import { sendDocumentReminder, sendMail } from "./mail.service.js";

export const mailRouter = Router();

mailRouter.post(
  "/document-reminder",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body ?? {};
      const data = await sendDocumentReminder(req.auth!.operationalCompanyId, {
        customerId: String(body.customerId ?? ""),
        to: String(body.to ?? ""),
        customerName: String(body.customerName ?? ""),
        reference: String(body.reference ?? ""),
        missingDocuments: Array.isArray(body.missingDocuments)
          ? body.missingDocuments.map((item: unknown) => String(item))
          : []
      });
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