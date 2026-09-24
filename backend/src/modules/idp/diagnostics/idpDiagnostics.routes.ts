import { Router } from "express";
import { asyncHandler } from "../../../common/utils/asyncHandler.js";
import { HttpError } from "../../../common/middlewares/errorHandler.js";
import { requireReadWriteCapabilities } from "../../../common/middlewares/authorization.js";
import { getIdpProcessingDiagnostic } from "./idpDiagnostics.service.js";

export const idpDiagnosticsRouter = Router({ mergeParams: true });

idpDiagnosticsRouter.use(requireReadWriteCapabilities(
  ["beyanname.view", "beyanname.write", "beyanname.approve"],
  [],
));

idpDiagnosticsRouter.get("/:processingRunId", asyncHandler(async (req, res) => {
  const companyId = req.auth!.operationalCompanyId;
  const declarationId = req.params.id;
  const diagnostic = await getIdpProcessingDiagnostic({
    companyId,
    declarationId,
    processingRunId: req.params.processingRunId,
  });
  if (!diagnostic) throw new HttpError(404, "IDP processing run bulunamadı.");
  res.json(diagnostic);
}));
