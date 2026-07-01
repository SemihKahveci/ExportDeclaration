import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as ctrl from "./materialRecord.controller.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

export const materialRecordRouter = Router();

materialRecordRouter.get("/import-template", asyncHandler(ctrl.getImportTemplate));
materialRecordRouter.get("/customer-counts", asyncHandler(ctrl.getCustomerCounts));
materialRecordRouter.get("/", asyncHandler(ctrl.getRecords));
materialRecordRouter.post("/import", upload.single("file"), asyncHandler(ctrl.postImportExcel));
materialRecordRouter.post("/", asyncHandler(ctrl.postRecord));
materialRecordRouter.post("/bulk", asyncHandler(ctrl.postBulkRecords));
materialRecordRouter.patch("/:id", asyncHandler(ctrl.patchRecord));
materialRecordRouter.delete("/:id", asyncHandler(ctrl.deleteRecord));
