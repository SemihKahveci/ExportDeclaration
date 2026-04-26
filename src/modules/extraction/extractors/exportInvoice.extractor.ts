import type { DocumentTypeValue } from "../../../common/enums/documentType.js";
import type { ExtractedSource } from "../../normalization/normalizedDeclaration.types.js";

/** İngilizce ihracat faturası (xlsx) — dokümandaki güçlü destekleyici kaynak. */
export async function extractExportInvoice(_filePath: string): Promise<ExtractedSource> {
  const type: DocumentTypeValue = "EXPORT_INVOICE";
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
