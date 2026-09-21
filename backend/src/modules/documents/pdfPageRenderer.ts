import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { HttpError } from "../../common/middlewares/errorHandler.js";

const rendererScript = path.join(env.invoiceParserDir, "render_pdf_page.py");
const MAX_PNG_BYTES = 30 * 1024 * 1024;

export async function renderPdfPage(pdfPath: string, pageNumber: number): Promise<Buffer> {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new HttpError(400, "Geçersiz PDF sayfa numarası.");
  }

  const outputPath = path.join(os.tmpdir(), `export-declaration-page-${randomUUID()}.png`);
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        env.invoiceParserPython,
        [rendererScript, pdfPath, String(pageNumber), outputPath],
        { stdio: ["ignore", "ignore", "pipe"], windowsHide: true }
      );

      const errors: Buffer[] = [];
      child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) return resolve();
        if (code === 3) return reject(new HttpError(404, "PDF sayfası bulunamadı."));
        const detail = Buffer.concat(errors).toString("utf8").trim();
        reject(new HttpError(500, detail || "PDF sayfası görüntülenemedi."));
      });
    });

    const stat = await fs.stat(outputPath);
    if (stat.size <= 0 || stat.size > MAX_PNG_BYTES) {
      throw new HttpError(500, "PDF sayfa önizleme boyutu geçersiz.");
    }

    const png = await fs.readFile(outputPath);
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (png.length < signature.length || !png.subarray(0, signature.length).equals(signature)) {
      throw new HttpError(500, "PDF renderer geçerli PNG üretmedi.");
    }
    return png;
  } finally {
    await fs.unlink(outputPath).catch(() => undefined);
  }
}
