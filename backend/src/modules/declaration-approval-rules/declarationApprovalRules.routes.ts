import { Router } from "express";
import { requireReadWriteCapabilities } from "../../common/middlewares/authorization.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as ctrl from "./declarationApprovalRules.controller.js";

export const declarationApprovalRulesRouter = Router();

declarationApprovalRulesRouter.use(requireReadWriteCapabilities(
  ["beyanname.view", "beyanname.write", "beyanname.approve", "beyanname_onay.view", "beyanname_onay.approve"],
  ["beyanname.approve", "beyanname_onay.approve", "ayarlar.users"]
));

declarationApprovalRulesRouter.get("/", asyncHandler(ctrl.getRules));
declarationApprovalRulesRouter.put("/", asyncHandler(ctrl.putRules));
