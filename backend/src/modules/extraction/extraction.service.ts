import type { DocumentTypeValue } from "../../common/enums/documentType.js";
import { DocumentType } from "../../common/enums/documentType.js";
import type { DocumentDoc } from "../documents/document.model.js";
import type { ExtractedSource } from "../normalization/normalizedDeclaration.types.js";
import { extractInvoice } from "./extractors/invoice.extractor.js";
import { extractInvoiceXml } from "./extractors/invoiceXml.extractor.js";
import { extractPackingList } from "./extractors/packingList.extractor.js";
import { extractProforma } from "./extractors/proforma.extractor.js";
import { extractBillOfLadingInstruction } from "./extractors/billOfLading.extractor.js";
import { extractExportInvoice } from "./extractors/exportInvoice.extractor.js";

export async function extractFromUploaded(doc: DocumentDoc): Promise<ExtractedSource> {
  const path = doc.filePath ?? "";
  const mime = doc.mimeType;

  switch (doc.type as DocumentTypeValue) {
    case DocumentType.INVOICE:
      return extractInvoice(path, mime);
    case DocumentType.E_INVOICE_XML:
      return extractInvoiceXml(path);
    case DocumentType.EXPORT_INVOICE:
      return extractExportInvoice(path);
    case DocumentType.PACKING_LIST:
      return extractPackingList(path);
    case DocumentType.PROFORMA:
      return extractProforma(path);
    case DocumentType.BILL_OF_LADING_INSTRUCTION:
      return extractBillOfLadingInstruction(path);
    default:
      return { type: DocumentType.OTHER, data: {} };
  }
}
