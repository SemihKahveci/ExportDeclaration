import { Router } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as ctrl from "./mailTemplate.controller.js";

export const mailTemplateRouter = Router();

mailTemplateRouter.get("/", asyncHandler(ctrl.getTemplates));
mailTemplateRouter.post("/", asyncHandler(ctrl.postTemplate));
mailTemplateRouter.patch("/:id", asyncHandler(ctrl.patchTemplate));
mailTemplateRouter.delete("/:id", asyncHandler(ctrl.deleteTemplate));
