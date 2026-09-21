import { Router } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as ctrl from "./customsSupplement.controller.js";
export const customsSupplementRouter=Router();
customsSupplementRouter.get("/:id/customs-supplements",asyncHandler(ctrl.list));
customsSupplementRouter.get("/:id/customs-supplements/effective",asyncHandler(ctrl.effective));
customsSupplementRouter.post("/:id/customs-supplements/decisions",asyncHandler(ctrl.append));
