import { Router } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as ctrl from "./user.controller.js";

export const userRouter = Router();

userRouter.get("/", asyncHandler(ctrl.getUsers));
userRouter.post("/", asyncHandler(ctrl.postUser));
userRouter.patch("/:id", asyncHandler(ctrl.patchUser));
