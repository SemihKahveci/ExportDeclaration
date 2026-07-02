import { Router } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as ctrl from "./documentRule.controller.js";

export const documentRuleRouter = Router();

documentRuleRouter.get("/stats", asyncHandler(ctrl.getStats));
documentRuleRouter.get("/", asyncHandler(ctrl.getRules));
documentRuleRouter.post("/", asyncHandler(ctrl.postRule));
documentRuleRouter.patch("/:id/toggle", asyncHandler(ctrl.patchToggle));
documentRuleRouter.patch("/:id", asyncHandler(ctrl.patchRule));
documentRuleRouter.delete("/:id", asyncHandler(ctrl.deleteRule));
