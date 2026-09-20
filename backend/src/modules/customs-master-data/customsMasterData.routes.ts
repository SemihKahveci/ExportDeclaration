import { Router } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as ctrl from "./customsMasterData.controller.js";
export const customsMasterDataRouter=Router();
customsMasterDataRouter.get("/",asyncHandler(ctrl.getRecords));
customsMasterDataRouter.post("/",asyncHandler(ctrl.postRecord));
customsMasterDataRouter.patch("/:id",asyncHandler(ctrl.patchRecord));
customsMasterDataRouter.delete("/:id",asyncHandler(ctrl.deleteRecord));
