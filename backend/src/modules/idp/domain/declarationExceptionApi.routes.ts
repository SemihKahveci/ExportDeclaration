import { Router } from "express";
import { requireReadWriteCapabilities } from "../../../common/middlewares/authorization.js";
import {
  getCurrentDeclarationExceptionsController,
  listDeclarationExceptionAuditController,
} from "./declarationExceptionApi.controller.js";

export const declarationExceptionApiRouter = Router({ mergeParams: true });

declarationExceptionApiRouter.use(requireReadWriteCapabilities(
  ["beyanname.view", "beyanname.write", "beyanname.approve"],
  ["beyanname.write"],
));

declarationExceptionApiRouter.get("/current", getCurrentDeclarationExceptionsController);
declarationExceptionApiRouter.get("/audit", listDeclarationExceptionAuditController);
