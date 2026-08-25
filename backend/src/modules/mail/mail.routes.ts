import { Router, type Request, type Response, type NextFunction } from "express";

import { sendMail } from "./mail.service.js";

export const mailRouter = Router();

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