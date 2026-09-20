import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { discoverInvoiceOriginFieldCandidates } from "../../src/modules/idp/candidates/invoiceOriginCandidateDiscovery.js";
import type { GenericInvoiceCandidateAudit } from "../../src/modules/idp/domain/genericCandidateIntegration.types.js";

const fixtures = [
  { runId: "6aad3238ca6e4f9c2d155501", expectedLines: 56, source: "NATIVE_TEXT" },
  { runId: "6aad3295ca6e4f9c2d155513", expectedLines: 41, source: "OCR" },
] as const;

async function main() {
  await mongoose.connect(env.mongoUri);
  try {
    const results = [];
    for (const fixture of fixtures) {
      const run: any = await ProcessingRunModel.findById(fixture.runId).lean();
      assert(run?.canonicalDocument, `canonical missing ${fixture.runId}`);
      const segments = run?.candidates?.segments;
      const audit: GenericInvoiceCandidateAudit | undefined = Array.isArray(segments)
        ? segments.map((segment: any) => segment?.data?.genericCandidateAudit).find(Boolean)
        : undefined;
      assert(audit?.candidates?.fields, `generic candidate fields missing ${fixture.runId}`);

      const segmentId = String(segments?.[0]?.segmentId ?? "invoice");
      const origin = discoverInvoiceOriginFieldCandidates(run.canonicalDocument, segmentId, audit.candidates);
      const originFields = Object.entries(origin.fields)
        .filter(([field]) => /^goodsLines\.\d+\.origin$/.test(field))
        .sort((a, b) => Number(a[0].split(".")[1]) - Number(b[0].split(".")[1]));

      assert.equal(originFields.length, fixture.expectedLines, `origin count mismatch ${fixture.runId}`);
      for (const [field, candidates] of originFields) {
        assert.equal(candidates.length, 1, `${field} must have exactly one origin candidate`);
        const candidate = candidates[0]!;
        assert.equal(typeof candidate.value, "string");
        assert(String(candidate.value).trim().length > 0);
        assert.equal(candidate.extractor, "invoice-origin-generic-v1");
        assert.equal(candidate.evidence.length, 1);
        assert.equal(candidate.evidence[0]!.contentSource, fixture.source);
        assert(candidate.evidence[0]!.bbox, `${field} evidence bbox missing`);
        assert.equal(candidate.evidence[0]!.text, candidate.value);
      }

      results.push({
        runId: fixture.runId,
        expectedLines: fixture.expectedLines,
        originCandidates: originFields.length,
        contentSource: fixture.source,
        sample: originFields.slice(0, 5).map(([field, candidates]) => ({
          field,
          value: candidates[0]!.value,
          pageNumber: candidates[0]!.evidence[0]!.pageNumber,
          bbox: candidates[0]!.evidence[0]!.bbox,
        }))
      });
    }
    console.log(JSON.stringify({
      event: "idp.invoice-origin.production-regression.passed",
      totalLines: results.reduce((sum, item) => sum + item.originCandidates, 0),
      results
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
