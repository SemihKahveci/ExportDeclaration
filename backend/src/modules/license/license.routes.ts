import { Router } from "express";
import { validateLicense } from "./license.service.js";

export const licenseRouter = Router();

licenseRouter.get("/status", async (_req, res) => {
  const result = await validateLicense();

  if (!result.valid) {
    res.status(403).json(result);
    return;
  }

  res.json(result);
});