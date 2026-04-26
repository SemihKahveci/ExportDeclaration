import type { DocumentTypeValue } from "../../../common/enums/documentType.js";
import type { ExtractedSource } from "../../normalization/normalizedDeclaration.types.js";

export async function extractBillOfLadingInstruction(_filePath: string): Promise<ExtractedSource> {
  const type: DocumentTypeValue = "BILL_OF_LADING_INSTRUCTION";
  return {
    type,
    data: { transport: {}, parties: { notify: {} } }
  };
}
