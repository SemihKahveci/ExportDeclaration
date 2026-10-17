import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import { discoverGenericInvoiceFieldCandidates } from "../../src/modules/idp/candidates/genericInvoiceCandidateDiscovery.js";
import { discoverInvoiceHeaderPartyFieldCandidates } from "../../src/modules/idp/candidates/invoiceHeaderPartyCandidateDiscovery.js";
import { discoverInvoiceShipmentFieldCandidates } from "../../src/modules/idp/candidates/invoiceShipmentCandidateDiscovery.js";
import { discoverInvoiceCommercialTermsFieldCandidates } from "../../src/modules/idp/candidates/invoiceCommercialTermsCandidateDiscovery.js";
import { PRODUCT_E2E_GENERALIZATION_CASES } from "./productE2EGeneralizationGroundTruth.js";
import { PRODUCT_E2E_CORPUS_CASES } from "./productE2ECorpusGroundTruth.js";

const TARGETS = [
  PRODUCT_E2E_CORPUS_CASES.find((entry) => entry.id === "clk-celikel")!.pdf,
  ...PRODUCT_E2E_GENERALIZATION_CASES
    .filter((entry) => ["eryem-yem-0037", "pml-p0087", "dermeternal-2026-0001", "ningbo-wyl-2026060501"].includes(entry.id))
    .map((entry) => entry.pdf),
];

const ANCHOR = /(?:FATURA|INVOICE|RECHNUNG|DATE|DATUM|TARIH|TOTAL|TOPLAM|GROSS|BRUT|NET|PACKAGE|PACK|PALET|PALLET|BANK|BANKA|IBAN|SWIFT|PAYMENT|ODEME|TESLIM|DELIVERY|SELLER|BUYER|EXPORTER|IMPORTER|CUSTOMER|CONSIGNEE|FIRMA|ADRESSE|ADDRESS|BILL\s*TO|SHIP\s*TO|HSN|HS\s*CODE|GTIP|DESCRIPTION|ACIKLAMA|QTY|QUANTITY|MIKTAR|PCS|PIECES|KG|EUR|USD|FOB|DAP|EXW)/i;

function compactEnvelope(envelope: any) {
  return Object.fromEntries(Object.entries(envelope?.fields ?? {}).map(([field, candidates]: any) => [
    field,
    candidates.map((candidate: any) => ({
      value: candidate.value,
      confidence: candidate.confidence,
      extractor: candidate.extractor,
      evidence: (candidate.evidence ?? []).map((e: any) => ({ pageNumber: e.pageNumber, text: e.text, bbox: e.bbox ?? null, contentSource: e.contentSource })),
    })),
  ]));
}

function canonicalLines(canonical: CanonicalDocument) {
  return canonical.pages.flatMap((page: any) => {
    const lines = page.lines?.length
      ? page.lines
      : [];
    return lines
      .map((line: any, index: number) => ({ pageNumber: page.pageNumber, index, text: String(line.text ?? "").trim(), bbox: line.bbox ?? null, source: line.source }))
      .filter((line: any) => line.text && ANCHOR.test(line.text));
  });
}

function expectedFor(fileName: string): any {
  const general = PRODUCT_E2E_GENERALIZATION_CASES.find((entry) => entry.pdf === fileName);
  if (general) return general.expected;
  const corpus = PRODUCT_E2E_CORPUS_CASES.find((entry) => entry.pdf === fileName);
  return corpus?.expected ?? null;
}

async function diagnose(fileName: string) {
  const upload: any = await UploadedFileModel.findOne({ fileName }).sort({ createdAt: -1 }).lean();
  if (!upload) return { fileName, status: "MISSING_UPLOAD" };
  const run: any = await ProcessingRunModel.findOne({ uploadedFileId: upload._id, status: "COMPLETED" }).sort({ createdAt: -1 }).lean();
  if (!run?.canonicalDocument?.pages?.length) return { fileName, status: "MISSING_CANONICAL", uploadId: String(upload._id) };
  const canonical = run.canonicalDocument as CanonicalDocument;
  const provenance: any = Object.values(run.declarationCandidates?.fields ?? {}).flat()[0];
  const segmentId = provenance?.evidence?.[0]?.segmentId ?? "segment-001";
  const headerParty = discoverInvoiceHeaderPartyFieldCandidates(canonical, segmentId);
  const shipment = discoverInvoiceShipmentFieldCandidates(canonical, segmentId);
  const commercial = discoverInvoiceCommercialTermsFieldCandidates(canonical, segmentId);
  const generic = discoverGenericInvoiceFieldCandidates(canonical, segmentId);
  return {
    fileName,
    status: "DIAGNOSED",
    uploadId: String(upload._id),
    runId: String(run._id),
    expected: expectedFor(fileName),
    currentDeterministic: {
      headerParty: compactEnvelope(headerParty),
      shipment: compactEnvelope(shipment),
      commercial: compactEnvelope(commercial),
      goods: Object.fromEntries(Object.entries(compactEnvelope(generic)).filter(([field]) => field.startsWith("goodsLines."))),
    },
    canonicalAnchorLines: canonicalLines(canonical),
  };
}

async function main() {
  await mongoose.connect(env.mongoUri);
  try {
    const documents = [];
    for (const fileName of TARGETS) documents.push(await diagnose(fileName));
    console.log(JSON.stringify({
      event: "product-e2e-1.8.50.1.persisted-semantic-discrepancies.diagnosed",
      documents,
      guardrails: {
        persistedCanonicalEvidenceOnly: true,
        ocrOrModelInference: false,
        databaseMutation: false,
        productionRuleMutation: false,
        supplierSpecificRules: false,
        directNormalizedWrite: false,
      },
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch {}
  process.exitCode = 1;
});
