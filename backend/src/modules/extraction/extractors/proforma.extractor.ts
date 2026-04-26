import type { DocumentTypeValue } from "../../../common/enums/documentType.js";
import type { ExtractedSource } from "../../normalization/normalizedDeclaration.types.js";

export async function extractProforma(_filePath: string): Promise<ExtractedSource> {
  const type: DocumentTypeValue = "PROFORMA";
  return {
    type,
    data: { trade: {}, goodsLines: [] }
  };
}
