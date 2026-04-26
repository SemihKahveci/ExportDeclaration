import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as ctrl from "./document.controller.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

export const documentSubRouter = Router({ mergeParams: true });

documentSubRouter.post("/", upload.single("file"), asyncHandler(ctrl.postDocument));
documentSubRouter.get("/", asyncHandler(ctrl.getDocuments));
