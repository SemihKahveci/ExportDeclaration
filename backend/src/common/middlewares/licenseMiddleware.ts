import type {
    NextFunction,
    Request,
    Response,
  } from "express";
  import { validateLicense } from "../../modules/license/license.service.js";
  
  export async function licenseMiddleware(
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const result = await validateLicense();
  
    if (!result.valid) {
      res.status(403).json({
        error: "LICENSE_INVALID",
        message: result.reason ?? "Geçerli lisans bulunamadı.",
      });
  
      return;
    }
  
    next();
  }