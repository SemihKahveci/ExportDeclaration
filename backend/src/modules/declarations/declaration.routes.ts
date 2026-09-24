import { Router } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as ctrl from "./declaration.controller.js";
import { documentSubRouter } from "../documents/document.routes.js";
import { humanReviewRouter } from "../idp/review/humanReview.routes.js";
import { declarationHumanReviewApiRouter } from "../idp/review/declarationHumanReviewApi.routes.js";
import { declarationExceptionApiRouter } from "../idp/domain/declarationExceptionApi.routes.js";
import { idpDiagnosticsRouter } from "../idp/diagnostics/idpDiagnostics.routes.js";
import { getControlProjection } from "../declaration-control/declarationControl.controller.js";
import { requireAnyCapability } from "../../common/middlewares/authorization.js";

const router = Router();

router.post("/", asyncHandler(ctrl.postDeclaration));
router.get("/", asyncHandler(ctrl.getDeclarations));
router.get("/:id/download-xml", asyncHandler(ctrl.getDownloadXml));
router.post("/:id/closure-workflow/transition",
  requireAnyCapability("kapanis.close", "beyanname.approve"),
  asyncHandler(ctrl.postClosureWorkflowTransition)
);
router.post("/:id/registration-workflow/transition",
  requireAnyCapability("tescil.write", "tescil.notify"),
  asyncHandler(ctrl.postRegistrationWorkflowTransition)
);
router.post("/:id/writing-workflow/transition",
  requireAnyCapability("beyanname.write", "beyanname.send"),
  asyncHandler(ctrl.postWritingWorkflowTransition)
);
router.post("/:id/preparation-workflow/transition",
  requireAnyCapability("beyanname.write"),
  asyncHandler(ctrl.postPreparationWorkflowTransition)
);
router.post("/:id/approval-workflow/transition",
  requireAnyCapability("beyanname.approve"),
  asyncHandler(ctrl.postApprovalWorkflowTransition)
);
router.get("/:id/control-provenance",
  requireAnyCapability("beyanname.view", "beyanname.write", "beyanname.approve"),
  asyncHandler(getControlProjection)
);
router.get("/:id", asyncHandler(ctrl.getDeclarationById));
router.patch("/:id", asyncHandler(ctrl.patchDeclarationById));

router.post("/:id/extract", asyncHandler(ctrl.postExtract));
router.post("/:id/normalize", asyncHandler(ctrl.postNormalize));
router.post("/:id/validate", asyncHandler(ctrl.postValidate));
router.post("/:id/generate-xml", asyncHandler(ctrl.postGenerateXml));
router.post("/:id/exports/evrim-excel", asyncHandler(ctrl.postExportEvrimExcel));
router.post("/:id/exports/ubl-ihracat", asyncHandler(ctrl.postExportUblIhracat));

router.use("/:id/documents", documentSubRouter);
router.use("/:id/idp-reviews", humanReviewRouter);
router.use("/:id/idp-human-review", declarationHumanReviewApiRouter);
router.use("/:id/idp-exceptions", declarationExceptionApiRouter);
router.use("/:id/idp-diagnostics", idpDiagnosticsRouter);

export const declarationRouter = router;
