import { Router } from "express";
import { requireReadWriteCapabilities } from "../../common/middlewares/authorization.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as ctrl from "./ihracatExcelAyar.controller.js";

export const ihracatExcelAyarRouter = Router();

ihracatExcelAyarRouter.use(requireReadWriteCapabilities(
  ["beyanname.view", "beyanname.write", "ayarlar.users"],
  ["ayarlar.users", "beyanname.write"]
));

ihracatExcelAyarRouter.get("/", asyncHandler(ctrl.getAyar));
ihracatExcelAyarRouter.put("/genel", asyncHandler(ctrl.putGenel));
ihracatExcelAyarRouter.put("/musteri", asyncHandler(ctrl.putMusteri));
ihracatExcelAyarRouter.delete("/musteri/:id", asyncHandler(ctrl.removeMusteri));
ihracatExcelAyarRouter.post("/resolve", asyncHandler(ctrl.postResolve));
