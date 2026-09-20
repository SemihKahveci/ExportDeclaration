import assert from "node:assert/strict";
import mongoose from "mongoose";

import { env } from "../../src/config/env.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { discoverInvoiceHeaderPartyFieldCandidates } from "../../src/modules/idp/candidates/invoiceHeaderPartyCandidateDiscovery.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";

const fixtures = [
  {
    runId: "6aad3238ca6e4f9c2d155501",
    invoiceNo: "VED2026000000146",
    source: "NATIVE_TEXT",
  },
  {
    runId: "6aad3295ca6e4f9c2d155513",
    invoiceNo: "VED2026000000110",
    source: "OCR",
  },
] as const;

async function main() {
  await mongoose.connect(env.mongoUri);

  try {
    const results = [];

    for (const f of fixtures) {
      const run = await ProcessingRunModel.findById(f.runId).lean();
      assert.ok(run);

      const canonical = run.canonicalDocument as CanonicalDocument;

      const segmentId = String(
        (run.candidates as any)?.segments?.[0]?.segmentId ?? "invoice",
      );

      const discovered =
        discoverInvoiceHeaderPartyFieldCandidates(
          canonical,
          segmentId,
        );

      const fields = discovered.fields;

      // Debug: gerçek canonical discovery sonucunu görelim.
      console.log(
        JSON.stringify(
          {
            runId: f.runId,
            expectedInvoiceNo: f.invoiceNo,
            discoveredHeaderParty: fields,
          },
          null,
          2,
        ),
      );

      const one = (key: string) => fields[key]?.[0];

      const inv = one("header.invoiceNo");
      const date = one("header.invoiceDate");
      const seller = one("parties.seller.name");
      const buyer = one("parties.buyer.name");

      assert.equal(inv?.value, f.invoiceNo);

      assert.match(
        String(date?.value),
        /^\d{4}-\d{2}-\d{2}$/,
      );

      if (!seller) {
        console.log(
          JSON.stringify(
            {
              event: "debug.seller-header-zone",
              runId: f.runId,
              page1Lines: canonical.pages[0]?.lines
                ?.filter((line) => line.bbox.y0 < 0.35)
                .map((line) => ({
                  text: line.text,
                  bbox: line.bbox,
                  source: line.source,
                })),
            },
            null,
            2,
          ),
        );
      }
      assert.ok(
        String(seller?.value ?? "").trim().length >= 3,
      );

      assert.ok(
        String(buyer?.value ?? "").trim().length >= 3,
      );

      for (const candidate of [
        inv,
        date,
        seller,
        buyer,
      ]) {
        assert.ok(candidate?.evidence?.[0]?.text);

        assert.equal(
          candidate?.evidence?.[0]?.contentSource,
          f.source,
        );
      }

      results.push({
        runId: f.runId,
        invoiceNo: inv?.value,
        invoiceDate: date?.value,
        seller: seller?.value,
        buyer: buyer?.value,
        contentSource: f.source,
      });
    }

    console.log(
      JSON.stringify(
        {
          event:
            "idp.invoice-header-party-enrichment.regression.passed",
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
  console.error(error);
  process.exitCode = 1;
});