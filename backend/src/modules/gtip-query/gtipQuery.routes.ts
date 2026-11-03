import { Router } from "express";
import multer from "multer";
import { requireReadWriteCapabilities } from "../../common/middlewares/authorization.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as ctrl from "./gtipQuery.controller.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

export const gtipQueryRouter = Router();

gtipQueryRouter.use(requireReadWriteCapabilities(
  ["musteri_gtip.view", "musteri_gtip.edit"],
  ["musteri_gtip.edit"]
));

gtipQueryRouter.get("/results", asyncHandler(ctrl.getResults));
gtipQueryRouter.put("/results", asyncHandler(ctrl.putResults));
gtipQueryRouter.post("/send-to-approval", asyncHandler(ctrl.postSendToApproval));
gtipQueryRouter.post("/parse-invoice", upload.single("file"), asyncHandler(ctrl.postParseInvoice));
