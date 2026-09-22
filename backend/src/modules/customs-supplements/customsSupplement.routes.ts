import { Router } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { requireReadWriteCapabilities } from "../../common/middlewares/authorization.js";
import * as ctrl from "./customsSupplement.controller.js";
export const customsSupplementRouter=Router();
customsSupplementRouter.use(requireReadWriteCapabilities(
 ["beyanname.view","beyanname.write","beyanname.approve"],
 ["beyanname.write","beyanname.approve"]
));
customsSupplementRouter.get("/:id/customs-supplements",asyncHandler(ctrl.list));
customsSupplementRouter.get("/:id/customs-supplements/effective",asyncHandler(ctrl.effective));
customsSupplementRouter.post("/:id/customs-supplements/decisions",asyncHandler(ctrl.append));
