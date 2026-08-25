import { Router } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { authContextMiddleware } from "../../common/middlewares/authContext.js";
import * as ctrl from "./auth.controller.js";

export const authRouter = Router();
authRouter.post("/login", asyncHandler(ctrl.postLogin));
authRouter.post("/logout", asyncHandler(ctrl.postLogout));
authRouter.get("/me", asyncHandler(authContextMiddleware), asyncHandler(ctrl.getMe));
