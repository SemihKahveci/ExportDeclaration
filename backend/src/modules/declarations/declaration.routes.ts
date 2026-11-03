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

const DECLARATION_READ = [
  "dosya_takip.view",
  "dosya_takip.edit",
  "beyanname.view",
  "beyanname.write",
  "beyanname.approve",
  "beyanname.send",
  "beyanname_onay.view",
  "beyanname_onay.approve",
  "tescil.view",
  "tescil.notify",
  "kapanis.evraklar",
  "kapanis.maliyet",
  "kapanis.evrak_yukleme",
  "kapanis.close",
  "gtip_hazirlik.view",
  "gtip_hazirlik.edit",
  "arsiv.view"
] as const;

router.post(
  "/",
  requireAnyCapability("dosya_takip.edit"),
  asyncHandler(ctrl.postDeclaration)
);
router.get(
  "/",
  requireAnyCapability(...DECLARATION_READ),
  asyncHandler(ctrl.getDeclarations)
);
router.get(
  "/:id/download-xml",
  requireAnyCapability("beyanname.view", "beyanname.write", "beyanname.approve", "beyanname.send"),
  asyncHandler(ctrl.getDownloadXml)
);
router.post("/:id/hold",
  requireAnyCapability("dosya_takip.edit", "beyanname.write"),
  asyncHandler(ctrl.postFileHoldTransition)
);
router.post("/:id/closure-workflow/transition",
  requireAnyCapability("kapanis.close", "beyanname.approve"),
  asyncHandler(ctrl.postClosureWorkflowTransition)
);
router.post("/:id/registration-workflow/transition",
  requireAnyCapability("tescil.view", "tescil.notify"),
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
  requireAnyCapability("beyanname.approve", "beyanname_onay.approve"),
  asyncHandler(ctrl.postApprovalWorkflowTransition)
);
router.get("/:id/control-provenance",
  requireAnyCapability("beyanname.view", "beyanname.write", "beyanname.approve"),
  asyncHandler(getControlProjection)
);
router.get(
  "/:id",
  requireAnyCapability(...DECLARATION_READ),
  asyncHandler(ctrl.getDeclarationById)
);
router.patch(
  "/:id",
  requireAnyCapability("beyanname.write", "dosya_takip.edit"),
  asyncHandler(ctrl.patchDeclarationById)
);

router.post(
  "/:id/extract",
  requireAnyCapability("beyanname.write"),
  asyncHandler(ctrl.postExtract)
);
router.post(
  "/:id/normalize",
  requireAnyCapability("beyanname.write"),
  asyncHandler(ctrl.postNormalize)
);
router.post(
  "/:id/validate",
  requireAnyCapability("beyanname.write", "beyanname.approve"),
  asyncHandler(ctrl.postValidate)
);
router.post(
  "/:id/generate-xml",
  requireAnyCapability("beyanname.write", "beyanname.send"),
  asyncHandler(ctrl.postGenerateXml)
);
router.post(
  "/:id/exports/evrim-excel",
  requireAnyCapability("beyanname.view", "beyanname.write", "beyanname.approve"),
  asyncHandler(ctrl.postExportEvrimExcel)
);
router.post(
  "/:id/exports/declaration-excel",
  requireAnyCapability("beyanname.view", "beyanname.write", "beyanname.approve"),
  asyncHandler(ctrl.postExportDeclarationWorkbook)
);
router.post(
  "/:id/exports/ubl-ihracat",
  requireAnyCapability("beyanname.view", "beyanname.write", "beyanname.approve"),
  asyncHandler(ctrl.postExportUblIhracat)
);

router.use("/:id/documents", documentSubRouter);
router.use("/:id/idp-reviews", humanReviewRouter);
router.use("/:id/idp-human-review", declarationHumanReviewApiRouter);
router.use("/:id/idp-exceptions", declarationExceptionApiRouter);
router.use("/:id/idp-diagnostics", idpDiagnosticsRouter);

export const declarationRouter = router;
