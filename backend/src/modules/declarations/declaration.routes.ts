import { Router } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as ctrl from "./declaration.controller.js";
import { documentSubRouter } from "../documents/document.routes.js";

const router = Router();

router.post("/", asyncHandler(ctrl.postDeclaration));
router.get("/", asyncHandler(ctrl.getDeclarations));
router.get("/:id/download-xml", asyncHandler(ctrl.getDownloadXml));
router.get("/:id", asyncHandler(ctrl.getDeclarationById));
router.patch("/:id", asyncHandler(ctrl.patchDeclarationById));

router.post("/:id/extract", asyncHandler(ctrl.postExtract));
router.post("/:id/normalize", asyncHandler(ctrl.postNormalize));
router.post("/:id/validate", asyncHandler(ctrl.postValidate));
router.post("/:id/generate-xml", asyncHandler(ctrl.postGenerateXml));

router.use("/:id/documents", documentSubRouter);

export const declarationRouter = router;
