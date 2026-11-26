import { Router } from "express";
import { requireReadWriteCapabilities } from "../../common/middlewares/authorization.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as ctrl from "./evrimLookup.controller.js";

export const evrimLookupRouter = Router();

evrimLookupRouter.use(requireReadWriteCapabilities(
  ["beyanname.view", "beyanname.write", "ayarlar.users"],
  ["beyanname.write", "ayarlar.users"]
));

evrimLookupRouter.get("/gonderen", asyncHandler(ctrl.getGonderen));
evrimLookupRouter.get("/alici", asyncHandler(ctrl.getAlici));
evrimLookupRouter.post("/alici/match", asyncHandler(ctrl.postMatchAlici));
evrimLookupRouter.get("/code-options", asyncHandler(ctrl.getCodeOptions));
