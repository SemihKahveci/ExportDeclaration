import { Router } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as ctrl from "./evrakRule.controller.js";

export const evrakRuleRouter = Router();

evrakRuleRouter.get("/stats", asyncHandler(ctrl.getStats));
evrakRuleRouter.get("/", asyncHandler(ctrl.getRules));
evrakRuleRouter.post("/", asyncHandler(ctrl.postRule));
evrakRuleRouter.patch("/:id/toggle", asyncHandler(ctrl.patchToggle));
evrakRuleRouter.patch("/:id", asyncHandler(ctrl.patchRule));
evrakRuleRouter.delete("/:id", asyncHandler(ctrl.deleteRule));
