import assert from "node:assert/strict";
import mongoose from "mongoose";

import { env } from "../../src/config/env.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { discoverInvoiceShipmentFieldCandidates } from "../../src/modules/idp/candidates/invoiceShipmentCandidateDiscovery.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";

const fixtures = [
  {
    runId: "6aad3238ca6e4f9c2d155501",
    packageType: "Bin",
    totalPackage: 2,
    grossKg: 554,
    netKg: 530,
    contentSource: "NATIVE_TEXT",
    evidence: {
      totalPackage: /TOPLAM.*KAP|KAP.*2/i,
      grossKg: /TOPLAM.*BR[ÜU]T.*A[GĞ]IRLIK|554/i,
      netKg: /TOPLAM.*NET.*A[GĞ]IRLIK|530/i,
    },
  },
  {
    runId: "6aad3295ca6e4f9c2d155513",
    packageType: "Bin",
    totalPackage: 1,
    grossKg: 162,
    netKg: 147,
    contentSource: "OCR",
    evidence: {
      totalPackage: /TOPLAM\s+KAP\s*:\s*1/i,
      grossKg: /TOPLAM\s+BR[ÜU]T\s+AGIRLIK\s*:\s*162[,.]00\s*KG/i,
      netKg: /TOPLAM\s+NET\s+AGIRLIK\s*:\s*147[,.]00\s*KG/i,
    },
  },
];

async function main(): Promise<void> {
  await mongoose.connect(env.mongoUri);

  try {
    const results = [];

    for (const fixture of fixtures) {
      const run = await ProcessingRunModel.findById(fixture.runId).lean();

      assert.ok(
        run,
        `ProcessingRun not found: ${fixture.runId}`,
      );

      const canonical = run.canonicalDocument as CanonicalDocument;

      assert.ok(
        canonical?.pages?.length,
        `Canonical document missing: ${fixture.runId}`,
      );

      const segmentId =
        ((run.candidates as any)?.segments?.[0]?.segmentId as
          | string
          | undefined) ?? "invoice";

      const discovered = discoverInvoiceShipmentFieldCandidates(
        canonical,
        segmentId,
      ).fields;

      const value = (field: string) =>
        discovered[field]?.[0]?.value;

      assert.equal(
        value("packageInfo.packageType"),
        fixture.packageType,
      );

      assert.equal(
        value("packageInfo.totalPackage"),
        fixture.totalPackage,
      );

      assert.equal(
        value("packageInfo.grossKg"),
        fixture.grossKg,
      );

      assert.equal(
        value("packageInfo.netKg"),
        fixture.netKg,
      );

      const assertEvidence = (
        field: string,
        expected: RegExp,
      ) => {
        const candidate = discovered[field]?.[0];

        assert.ok(
          candidate,
          `Candidate missing for ${field}: ${fixture.runId}`,
        );

        const evidence = candidate.evidence?.[0];

        assert.ok(
          evidence,
          `Evidence missing for ${field}: ${fixture.runId}`,
        );

        assert.ok(
          typeof evidence.text === "string" &&
            evidence.text.length > 0,
          `Evidence text missing for ${field}: ${fixture.runId}`,
        );

        assert.match(
          evidence.text,
          expected,
          `Wrong evidence text for ${field}: ${fixture.runId}`,
        );

        assert.equal(
          evidence.contentSource,
          fixture.contentSource,
          `Wrong contentSource for ${field}: ${fixture.runId}`,
        );

        assert.ok(
          evidence.bbox &&
            evidence.bbox.x1 > evidence.bbox.x0 &&
            evidence.bbox.y1 > evidence.bbox.y0,
          `Invalid evidence bbox for ${field}: ${fixture.runId}`,
        );
      };

      assertEvidence(
        "packageInfo.totalPackage",
        fixture.evidence.totalPackage,
      );

      assertEvidence(
        "packageInfo.grossKg",
        fixture.evidence.grossKg,
      );

      assertEvidence(
        "packageInfo.netKg",
        fixture.evidence.netKg,
      );

      results.push({
        runId: fixture.runId,
        packageType: value("packageInfo.packageType"),
        totalPackage: value("packageInfo.totalPackage"),
        grossKg: value("packageInfo.grossKg"),
        netKg: value("packageInfo.netKg"),
        evidence: {
          totalPackage:
            discovered["packageInfo.totalPackage"]?.[0]?.evidence?.[0]?.text,
          grossKg:
            discovered["packageInfo.grossKg"]?.[0]?.evidence?.[0]?.text,
          netKg:
            discovered["packageInfo.netKg"]?.[0]?.evidence?.[0]?.text,
        },
      });
    }

    console.log(
      JSON.stringify(
        {
          event: "idp.invoice-shipment-enrichment.regression.passed",
          results,
        },
        null,
        2,
      ),
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        event: "idp.invoice-shipment-enrichment.regression.failed",
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );

  process.exit(1);
});