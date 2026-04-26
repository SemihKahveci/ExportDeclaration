import type { DocumentTypeValue } from "../../../common/enums/documentType.js";
import type { ExtractedSource } from "../../normalization/normalizedDeclaration.types.js";

/** Sprint 2: UBL Invoice parse (ProfileID IHRACAT vb.). */
export async function extractInvoiceXml(_filePath: string): Promise<ExtractedSource> {
  const type: DocumentTypeValue = "E_INVOICE_XML";
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
