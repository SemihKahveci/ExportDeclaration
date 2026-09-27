import { renderPdfPage } from "../../documents/pdfPageRenderer.js";
import type { InvoiceLlmPageImage } from "../domain/invoiceLlmExtraction.types.js";

/** Render only explicitly requested 1-based pages. The caller owns page-count policy. */
export async function renderInvoicePagesForVision(pdfPath: string, pageNumbers: number[]): Promise<InvoiceLlmPageImage[]> {
  const uniquePages = [...new Set(pageNumbers)];
  if (uniquePages.length === 0 || uniquePages.some((page) => !Number.isInteger(page) || page < 1)) {
    throw new Error("Vision render için geçerli pageNumbers gerekli.");
  }
  const images: InvoiceLlmPageImage[] = [];
  for (const pageNumber of uniquePages) {
    images.push({ pageNumber, mimeType: "image/png", bytes: await renderPdfPage(pdfPath, pageNumber) });
  }
  return images;
}
