import { Router } from "express";
import { requireReadWriteCapabilities } from "../../common/middlewares/authorization.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as ctrl from "./documentRule.controller.js";

export const documentRuleRouter = Router();

documentRuleRouter.use(requireReadWriteCapabilities(
  ["evraklar.view", "evraklar.manage"],
  ["evraklar.manage"]
));

documentRuleRouter.get("/stats", asyncHandler(ctrl.getStats));
documentRuleRouter.get("/", asyncHandler(ctrl.getRules));
documentRuleRouter.post("/", asyncHandler(ctrl.postRule));
documentRuleRouter.patch("/:id/toggle", asyncHandler(ctrl.patchToggle));
documentRuleRouter.patch("/:id", asyncHandler(ctrl.patchRule));
documentRuleRouter.delete("/:id", asyncHandler(ctrl.deleteRule));
