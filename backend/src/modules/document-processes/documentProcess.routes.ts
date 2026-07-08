import { Router } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as ctrl from "./documentProcess.controller.js";

export const documentProcessRouter = Router();

documentProcessRouter.get("/", asyncHandler(ctrl.getProcesses));
documentProcessRouter.post("/", asyncHandler(ctrl.postProcess));
documentProcessRouter.patch("/:id", asyncHandler(ctrl.patchProcess));
documentProcessRouter.delete("/:id", asyncHandler(ctrl.deleteProcess));
