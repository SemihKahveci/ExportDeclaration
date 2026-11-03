import path from "node:path";
import { HttpError } from "../middlewares/errorHandler.js";

const ALLOWED = new Map<string, Set<string>>([
  ["application/pdf", new Set([".pdf"])],
  ["image/jpeg", new Set([".jpg", ".jpeg"])],
  ["image/png", new Set([".png"])],
  ["image/tiff", new Set([".tif", ".tiff"])],
  ["application/xml", new Set([".xml"])],
  ["text/xml", new Set([".xml"])],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", new Set([".xlsx"])],
  ["application/vnd.ms-excel", new Set([".xls"])]
]);

export function assertAllowedUpload(file: Express.Multer.File): void {
  const mime = String(file.mimetype ?? "").trim().toLowerCase();
  const ext = path.extname(file.originalname || "").toLowerCase();
  const allowedExt = ALLOWED.get(mime);
  if (!allowedExt || !allowedExt.has(ext)) {
    throw new HttpError(400, "Bu dosya türü yüklenemez. PDF, XML, Excel veya görüntü kullanın.");
  }
}

export function contentDispositionAttachment(fileName: string): string {
  const safe = path.basename(fileName || "file").replace(/["\r\n]/g, "_");
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
