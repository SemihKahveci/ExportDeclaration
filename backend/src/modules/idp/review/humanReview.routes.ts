import { Router } from "express";
import { asyncHandler } from "../../../common/utils/asyncHandler.js";
import * as ctrl from "./humanReview.controller.js";

export const humanReviewRouter = Router({ mergeParams: true });
humanReviewRouter.get("/:runId", asyncHandler(ctrl.getReview));
humanReviewRouter.get("/:runId/decisions", asyncHandler(ctrl.getDecisions));
humanReviewRouter.post("/:runId/decisions", asyncHandler(ctrl.postDecision));
