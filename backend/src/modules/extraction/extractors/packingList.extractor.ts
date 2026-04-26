import type { DocumentTypeValue } from "../../../common/enums/documentType.js";
import type { ExtractedSource } from "../../normalization/normalizedDeclaration.types.js";

export async function extractPackingList(_filePath: string): Promise<ExtractedSource> {
  const type: DocumentTypeValue = "PACKING_LIST";
  return {
    type,
    data: { packageInfo: {}, goodsLines: [] }
  };
}
