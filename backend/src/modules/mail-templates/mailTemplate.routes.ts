import { Router } from "express";
import { requireReadWriteCapabilities } from "../../common/middlewares/authorization.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as ctrl from "./mailTemplate.controller.js";

export const mailTemplateRouter = Router();

mailTemplateRouter.use(requireReadWriteCapabilities(
  ["mailler.view", "mailler.manage", "ayarlar.mails"],
  ["mailler.manage", "ayarlar.mails"]
));

mailTemplateRouter.get("/", asyncHandler(ctrl.getTemplates));
mailTemplateRouter.post("/", asyncHandler(ctrl.postTemplate));
mailTemplateRouter.patch("/:id", asyncHandler(ctrl.patchTemplate));
mailTemplateRouter.delete("/:id", asyncHandler(ctrl.deleteTemplate));
