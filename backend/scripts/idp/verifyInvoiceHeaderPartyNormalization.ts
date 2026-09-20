import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { runNormalize } from "../../src/modules/declarations/declaration.service.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import type { NormalizedDeclaration } from "../../src/modules/normalization/normalizedDeclaration.types.js";

const COMPANY_ID = "acfad479cc57d647cdfd1f99";

const FIXTURES = [
  {
    declarationId: "6aad3237ca6e4f9c2d1554f5",
    invoiceNo: "VED2026000000146",
    invoiceDate: "2026-06-05",
    seller: "Vekmar Elektrik Sist.Yat.ve Tic.A.Ş.",
    buyer: "POWER TECHNOLOGY OU",
    expectedLines: 56,
    contentSource: "NATIVE_TEXT",
  },
  {
    declarationId: "6aad3295ca6e4f9c2d155507",
    invoiceNo: "VED2026000000110",
    invoiceDate: "2026-04-24",
    seller: "Vekmar Elektrik Sist.Yat.ve Tic.A.Ş.",
    buyer: "COSMIEL GMBH",
    expectedLines: 41,
    contentSource: "OCR",
  },
] as const;

type TraceEntry = {
  value?: unknown;
  source?: string;
  extractor?: string;
  evidence?: Array<{
    text?: string;
    contentSource?: string;
    pageNumber?: number;
  }>;
  processingRunId?: string;
  uploadedFileId?: string;
};

function traceEntry(sourceTrace: unknown, field: string): TraceEntry {
  assert.ok(sourceTrace && typeof sourceTrace === "object", "sourceTrace missing");
  const entry = (sourceTrace as Record<string, unknown>)[field];
  assert.ok(entry && typeof entry === "object", `sourceTrace missing for ${field}`);
  return entry as TraceEntry;
}

function assertCanonicalTrace(
  sourceTrace: unknown,
  field: string,
  expectedValue: string,
  expectedContentSource: string,
): void {
  const trace = traceEntry(sourceTrace, field);

  assert.equal(trace.value, expectedValue, `${field} trace value mismatch`);
  assert.equal(trace.source, "IDP_GENERIC", `${field} must come from IDP_GENERIC`);
  assert.match(
    String(trace.extractor ?? ""),
    /^invoice-header-party-generic-v4$/,
    `${field} extractor mismatch`,
  );
  assert.ok(trace.processingRunId, `${field} processingRunId missing`);
  assert.ok(trace.uploadedFileId, `${field} uploadedFileId missing`);

  const evidence = trace.evidence ?? [];
  assert.ok(evidence.length > 0, `${field} evidence missing`);
  assert.equal(
    evidence[0]?.contentSource,
    expectedContentSource,
    `${field} contentSource mismatch`,
  );
  assert.ok(
    String(evidence[0]?.text ?? "").trim().length > 0,
    `${field} evidence text missing`,
  );
}

async function main(): Promise<void> {
  await mongoose.connect(env.mongoUri);

  const companyId = new mongoose.Types.ObjectId(COMPANY_ID);
  const results: unknown[] = [];

  for (const fixture of FIXTURES) {
    await runNormalize(companyId, fixture.declarationId);

    const declaration = await DeclarationModel.findOne({
      _id: fixture.declarationId,
      companyId,
    }).lean();

    assert.ok(declaration, `declaration missing: ${fixture.declarationId}`);
    assert.ok(
      declaration.normalizedData,
      `normalizedData missing: ${fixture.declarationId}`,
    );

    const normalized = declaration.normalizedData as NormalizedDeclaration;

    assert.equal(normalized.header.invoiceNo, fixture.invoiceNo);
    assert.equal(
      normalized.header.invoiceDate instanceof Date
        ? normalized.header.invoiceDate.toISOString().slice(0, 10)
        : String(normalized.header.invoiceDate).slice(0, 10),
      fixture.invoiceDate,
    );
    assert.equal(normalized.parties.seller?.name, fixture.seller);
    assert.equal(normalized.parties.buyer?.name, fixture.buyer);
    assert.equal(normalized.goodsLines.length, fixture.expectedLines);

    assertCanonicalTrace(
      declaration.sourceTrace,
      "header.invoiceNo",
      fixture.invoiceNo,
      fixture.contentSource,
    );
    assertCanonicalTrace(
      declaration.sourceTrace,
      "header.invoiceDate",
      fixture.invoiceDate,
      fixture.contentSource,
    );
    assertCanonicalTrace(
      declaration.sourceTrace,
      "parties.seller.name",
      fixture.seller,
      fixture.contentSource,
    );
    assertCanonicalTrace(
      declaration.sourceTrace,
      "parties.buyer.name",
      fixture.buyer,
      fixture.contentSource,
    );

    results.push({
      declarationId: fixture.declarationId,
      invoiceNo: normalized.header.invoiceNo,
      invoiceDate: normalized.header.invoiceDate,
      seller: normalized.parties.seller?.name,
      buyer: normalized.parties.buyer?.name,
      goodsLines: normalized.goodsLines.length,
      contentSource: fixture.contentSource,
      canonicalTraceVerified: true,
    });
  }

  console.log(
    JSON.stringify(
      {
        event: "idp.invoice-header-party-normalization.regression.passed",
        results,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
