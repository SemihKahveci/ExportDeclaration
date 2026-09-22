import { Router } from "express";
import { asyncHandler } from "../../../common/utils/asyncHandler.js";
import { requireReadWriteCapabilities } from "../../../common/middlewares/authorization.js";
import * as ctrl from "./humanReview.controller.js";

export const humanReviewRouter = Router({ mergeParams: true });
humanReviewRouter.use(requireReadWriteCapabilities(
  ["beyanname.view", "beyanname.write", "beyanname.approve"],
  ["beyanname.write"],
));
humanReviewRouter.get("/latest", asyncHandler(ctrl.getLatestReview));
humanReviewRouter.get("/:runId", asyncHandler(ctrl.getReview));
humanReviewRouter.get("/:runId/decisions", asyncHandler(ctrl.getDecisions));
humanReviewRouter.post("/:runId/decisions", asyncHandler(ctrl.postDecision));
