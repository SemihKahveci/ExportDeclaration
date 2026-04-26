import type { DocumentTypeValue } from "../../../common/enums/documentType.js";
import type { ExtractedSource } from "../../normalization/normalizedDeclaration.types.js";

/**
 * INVOICE: PDF veya yapılandırılmış dosya — MVP’de PDF görsel/OCR yok; seçilebilir metin veya manuel/placeholder.
 * Sprint 2’de xlsx/pdf text çıkarımı burada genişletilir.
 */
export async function extractInvoice(
  _filePath: string,
  _mimeType: string | undefined
): Promise<ExtractedSource> {
  const type: DocumentTypeValue = "INVOICE";
  return {
    type,
    data: {
      header: {},
      parties: {},
      trade: {},
      transport: {},
      packageInfo: {},
      goodsLines: []
    }
  };
}
