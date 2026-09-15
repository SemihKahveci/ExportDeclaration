import { Router } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { requireAnyCapability, requireSuperAdmin } from "../../common/middlewares/authorization.js";
import * as ctrl from "./user.controller.js";

export const userRouter = Router();

userRouter.get(
  "/assignable",
  requireAnyCapability("musteriler.view", "musteriler.edit", "dosya_takip.view", "dosya_takip.edit"),
  asyncHandler(ctrl.getAssignableUsers),
);

userRouter.use(requireSuperAdmin);
userRouter.get("/", asyncHandler(ctrl.getUsers));
userRouter.post("/", asyncHandler(ctrl.postUser));
userRouter.patch("/:id", asyncHandler(ctrl.patchUser));
userRouter.delete("/:id", asyncHandler(ctrl.removeUser));
