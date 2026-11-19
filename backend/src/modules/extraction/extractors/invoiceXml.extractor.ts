import fs from "node:fs/promises";
import type { DocumentTypeValue } from "../../../common/enums/documentType.js";
import { DocumentType } from "../../../common/enums/documentType.js";
import type { ExtractedSource } from "../../normalization/normalizedDeclaration.types.js";
import { CandidateExtractionStatus, type CandidateExtractionEnvelope } from "../../idp/domain/candidateExtraction.types.js";
import { ClassifiedDocumentType } from "../../idp/domain/segmentClassification.types.js";
import { parseUblIhracatInvoiceXml } from "../ubl/ublIhracatInvoice.parser.js";
import { buildUblIhracatFieldCandidates, ublParsedToExtractedData } from "../ubl/ublIhracatFieldCandidates.js";

export interface InvoiceXmlExtractionResult extends ExtractedSource {
  candidateExtraction: CandidateExtractionEnvelope;
}

/** UBL-TR e-ihracat XML → ExtractedSource + Foundation 6 fieldCandidates. */
export async function extractInvoiceXml(filePath: string): Promise<InvoiceXmlExtractionResult> {
  const type: DocumentTypeValue = DocumentType.E_INVOICE_XML;
  if (!filePath) {
    return {
      type,
      data: emptyData(),
      candidateExtraction: emptyCandidates(),
    };
  }

  const xml = await readXmlText(filePath);
  const parsed = parseUblIhracatInvoiceXml(xml);
  const data = ublParsedToExtractedData(parsed);
  const fieldCandidates = buildUblIhracatFieldCandidates(parsed);

  const candidateExtraction: CandidateExtractionEnvelope = {
    version: "1",
    segments: [{
      segmentId: "ubl-xml-1",
      documentType: ClassifiedDocumentType.INVOICE,
      status: CandidateExtractionStatus.EXTRACTED,
      extractor: "ubl-ihracat-xml-v1",
      pageNumbers: [1],
      data: {
        ...data,
        fieldCandidates,
      },
    }],
  };

  return { type, data: { ...data, fieldCandidates }, candidateExtraction };
}

async function readXmlText(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  const head = buf.subarray(0, 180).toString("ascii");
  const encodingMatch = head.match(/encoding\s*=\s*["']([^"']+)["']/i);
  const encoding = (encodingMatch?.[1] ?? "utf-8").toLowerCase();
  if (encoding.includes("iso-8859-9") || encoding.includes("windows-1254") || encoding.includes("latin5")) {
    return new TextDecoder("windows-1254").decode(buf);
  }
  // UTF-8 BOM
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString("utf8");
  }
  return buf.toString("utf8");
}

function emptyData(): Record<string, unknown> {
  return {
    header: {},
    parties: {},
    trade: {},
    transport: {},
    packageInfo: {},
    goodsLines: [],
  };
}

function emptyCandidates(): CandidateExtractionEnvelope {
  return {
    version: "1",
    segments: [{
      segmentId: "ubl-xml-1",
      documentType: ClassifiedDocumentType.INVOICE,
      status: CandidateExtractionStatus.SKIPPED,
      pageNumbers: [1],
      reason: "empty-xml-path",
    }],
  };
}
