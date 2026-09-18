import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { discoverGenericInvoiceFieldCandidates } from "../../src/modules/idp/candidates/genericInvoiceCandidateDiscovery.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import type { DocumentSegment } from "../../src/modules/idp/domain/documentSegment.types.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import type { SegmentClassification } from "../../src/modules/idp/domain/segmentClassification.types.js";
import { projectInvoiceCanonicalDocument } from "../../src/modules/idp/projector/canonicalSegmentProjector.js";
import { validateGenericInvoiceEvidence } from "../../src/modules/idp/validator/genericInvoiceEvidenceValidator.js";

async function main() {
  const ids = process.argv.slice(2);
  if (!ids.length) throw new Error("Pass one or more ProcessingRun IDs.");
  await mongoose.connect(env.mongoUri);
  const results = [];
  for (const id of ids) {
    const run = await ProcessingRunModel.findById(id).lean();
    if (!run?.canonicalDocument) throw new Error(`ProcessingRun ${id} has no canonicalDocument.`);
    const canonical = run.canonicalDocument as CanonicalDocument;
    const segments = (run.segments ?? []) as DocumentSegment[];
    const classifications = (run.classifications ?? []) as SegmentClassification[];
    const invoiceCanonical = projectInvoiceCanonicalDocument(canonical, segments, classifications);
    const invoiceSegment = classifications.find(item => item.documentType === "INVOICE")?.segmentId ?? segments[0]?.segmentId;
    if (!invoiceSegment) throw new Error(`ProcessingRun ${id} has no invoice segment.`);
    const envelope = discoverGenericInvoiceFieldCandidates(invoiceCanonical, invoiceSegment);
    const validation = validateGenericInvoiceEvidence(invoiceCanonical, envelope);
    results.push({ processingRunId: id, contentKind: canonical.analysis.contentKind, pageCount: invoiceCanonical.pages.length, ...validation.summary, status: validation.status, reviewRows: validation.rows.filter(row => row.status === "REVIEW_REQUIRED").slice(0, 10) });
  }
  console.log(JSON.stringify({ event: "idp.generic-invoice-evidence.audit", results }, null, 2));
  await mongoose.disconnect();
}
main().catch(async error => { console.error(error); try { await mongoose.disconnect(); } catch {} process.exit(1); });
