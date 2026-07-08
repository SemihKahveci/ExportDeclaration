import { Router } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as ctrl from "./declarationApprovalRules.controller.js";

export const declarationApprovalRulesRouter = Router();

declarationApprovalRulesRouter.get("/", asyncHandler(ctrl.getRules));
declarationApprovalRulesRouter.put("/", asyncHandler(ctrl.putRules));
