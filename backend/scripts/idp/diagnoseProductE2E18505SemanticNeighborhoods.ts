import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import type { CanonicalDocument, CanonicalLine } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import { discoverInvoiceHeaderPartyFieldCandidates } from "../../src/modules/idp/candidates/invoiceHeaderPartyCandidateDiscovery.js";
import { discoverInvoiceShipmentFieldCandidates } from "../../src/modules/idp/candidates/invoiceShipmentCandidateDiscovery.js";
import { discoverInvoiceCommercialTermsFieldCandidates } from "../../src/modules/idp/candidates/invoiceCommercialTermsCandidateDiscovery.js";

const TARGETS = [
  "INVOICE - P0087.pdf",
  "Rechnung-Dermeternal GmbH.pdf",
  "WYL2026060501.pdf",
];

const INTEREST = /(INVOICE|DATE|DATUM|PRO-?INV|NET|GROSS|GR\.?\s*WT|WEIGHT|FIRMA|ADRES|ADDRESS|TO\b|BUYER|CONSIGNEE|LIMITED|SIRKET|HANDELSREGISTER|REGISTER|TERM|PAYMENT|BANK|TOTAL)/i;

function lineView(line: CanonicalLine, index: number) {
  return { index, text: line.text, bbox: line.bbox, source: line.source };
}

function neighborhoods(canonical: CanonicalDocument) {
  return canonical.pages.flatMap((page) => {
    const lines = page.lines ?? [];
    const selected = new Set<number>();
    lines.forEach((line, index) => {
      if (!INTEREST.test(line.text)) return;
      for (let i = Math.max(0, index - 3); i <= Math.min(lines.length - 1, index + 4); i++) selected.add(i);
    });
    return selected.size ? [{ pageNumber: page.pageNumber, lines: [...selected].sort((a,b)=>a-b).map(i => lineView(lines[i]!, i)) }] : [];
  });
}

function compactFields(envelope: any) {
  return Object.fromEntries(Object.entries(envelope?.fields ?? {}).map(([field, candidates]: any) => [field, candidates.map((candidate: any) => ({
    value: candidate.value,
    confidence: candidate.confidence,
    extractor: candidate.extractor,
    evidence: candidate.evidence,
  }))]));
}

async function inspect(fileName: string) {
  const upload: any = await UploadedFileModel.findOne({ fileName }).sort({ createdAt: -1 }).lean();
  if (!upload) return { fileName, status: "UPLOAD_MISSING" };
  const run: any = await ProcessingRunModel.findOne({ uploadedFileId: upload._id, status: "COMPLETED" }).sort({ createdAt: -1 }).lean();
  if (!run?.canonicalDocument?.pages?.length) return { fileName, status: "CANONICAL_MISSING", uploadId: String(upload._id) };
  const canonical = run.canonicalDocument as CanonicalDocument;
  const provenance: any = Object.values(run.declarationCandidates?.fields ?? {}).flat()[0];
  const segmentId = provenance?.evidence?.[0]?.segmentId ?? "segment-001";
  return {
    fileName,
    status: "DIAGNOSED",
    uploadId: String(upload._id),
    runId: String(run._id),
    currentDeterministic: {
      headerParty: compactFields(discoverInvoiceHeaderPartyFieldCandidates(canonical, segmentId)),
      shipment: compactFields(discoverInvoiceShipmentFieldCandidates(canonical, segmentId)),
      commercial: compactFields(discoverInvoiceCommercialTermsFieldCandidates(canonical, segmentId)),
    },
    canonicalSemanticNeighborhoods: neighborhoods(canonical),
  };
}

async function main() {
  await mongoose.connect(env.mongoUri);
  try {
    const documents = [];
    for (const fileName of TARGETS) documents.push(await inspect(fileName));
    console.log(JSON.stringify({
      event: "product-e2e-1.8.50.5.semantic-neighborhood-diagnostic",
      documents,
      guardrails: {
        persistedCanonicalEvidenceOnly: true,
        currentGeneralDeterministicParsersOnly: true,
        ocrOrModelInference: false,
        databaseMutation: false,
        productionParserMutation: false,
        directNormalizedWrite: false,
      },
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
