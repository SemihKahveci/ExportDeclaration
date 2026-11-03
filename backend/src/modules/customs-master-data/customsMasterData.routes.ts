import { Router } from "express";
import { requireReadWriteCapabilities } from "../../common/middlewares/authorization.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as ctrl from "./customsMasterData.controller.js";

export const customsMasterDataRouter = Router();

customsMasterDataRouter.use(requireReadWriteCapabilities(
  ["beyanname.view", "beyanname.write", "beyanname.approve"],
  ["beyanname.write", "beyanname.approve"]
));

customsMasterDataRouter.get("/effective", asyncHandler(ctrl.getEffectivePreview));
customsMasterDataRouter.get("/", asyncHandler(ctrl.getRecords));
customsMasterDataRouter.post("/", asyncHandler(ctrl.postRecord));
customsMasterDataRouter.patch("/:id", asyncHandler(ctrl.patchRecord));
customsMasterDataRouter.delete("/:id", asyncHandler(ctrl.deleteRecord));
