import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as ctrl from "./gtipQuery.controller.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

export const gtipQueryRouter = Router();

gtipQueryRouter.get("/results", asyncHandler(ctrl.getResults));
gtipQueryRouter.put("/results", asyncHandler(ctrl.putResults));
gtipQueryRouter.post("/send-to-approval", asyncHandler(ctrl.postSendToApproval));
gtipQueryRouter.post("/parse-invoice", upload.single("file"), asyncHandler(ctrl.postParseInvoice));
