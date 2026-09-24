import { Router } from "express";
import { asyncHandler } from "../../../common/utils/asyncHandler.js";
import { requireReadWriteCapabilities } from "../../../common/middlewares/authorization.js";
import * as ctrl from "./declarationHumanReviewApi.controller.js";

export const declarationHumanReviewApiRouter = Router({ mergeParams: true });

declarationHumanReviewApiRouter.use(requireReadWriteCapabilities(
  ["beyanname.view", "beyanname.write", "beyanname.approve"],
  ["beyanname.write"],
));

declarationHumanReviewApiRouter.get("/current", asyncHandler(ctrl.getCurrentReview));
declarationHumanReviewApiRouter.get("/audit", asyncHandler(ctrl.getReviewAudit));
declarationHumanReviewApiRouter.post("/current", asyncHandler(ctrl.postCurrentReview));
