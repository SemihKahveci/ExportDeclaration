import assert from "node:assert/strict";
import mongoose from "mongoose";
import * as XLSX from "xlsx";
import { env } from "../../src/config/env.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { runNormalize } from "../../src/modules/declarations/declaration.service.js";
import { exportDeclarationAsEvrimExcel } from "../../src/modules/declaration-exports/declarationExport.service.js";
import type { NormalizedDeclaration } from "../../src/modules/normalization/normalizedDeclaration.types.js";

const fixtures = [
  { declarationId: "6aad3237ca6e4f9c2d1554f5", expectedLines: 56 },
  { declarationId: "6aad3295ca6e4f9c2d155507", expectedLines: 41 },
] as const;

function readEvrimOrigins(buffer: Buffer): string[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  assert.deepEqual(workbook.SheetNames, ["Sayfa1", "Sayfa2"]);
  const sheet = workbook.Sheets["Sayfa1"];
  assert(sheet, "Sayfa1 missing");
  const rows = XLSX.utils.sheet_to_json<Array<unknown>>(sheet, { header: 1, raw: false });
  const headers = (rows[0] ?? []).map(String);
  const originIndex = headers.indexOf("MENŞE");
  assert(originIndex >= 0, "MENŞE column missing");
  return rows.slice(1).map(row => String(row[originIndex] ?? "").trim());
}

async function main() {
  await mongoose.connect(env.mongoUri);
  try {
    const results = [];
    for (const fixture of fixtures) {
      const before = await DeclarationModel.findById(fixture.declarationId).select({ companyId: 1 }).lean();
      assert(before?.companyId, `declaration/company missing ${fixture.declarationId}`);

      await runNormalize(before.companyId, fixture.declarationId);

      const declaration: any = await DeclarationModel.findById(fixture.declarationId).lean();
      assert(declaration, `declaration missing after normalize ${fixture.declarationId}`);
      assert.equal(declaration.status, "READY");

      const normalized = declaration.normalizedData as NormalizedDeclaration;
      assert.equal(normalized.goodsLines.length, fixture.expectedLines);

      const origins = normalized.goodsLines.map((line, index) => {
        assert.equal(typeof line.origin, "string", `goodsLines.${index}.origin type`);
        assert(line.origin!.trim(), `goodsLines.${index}.origin missing`);

        const trace = declaration.sourceTrace?.[`goodsLines.${index}.origin`];
        assert(trace, `goodsLines.${index}.origin trace missing`);
        assert.equal(trace.value, line.origin, `goodsLines.${index}.origin trace value mismatch`);
        assert.equal(trace.source, "IDP_GENERIC", `goodsLines.${index}.origin source mismatch`);
        assert.equal(trace.extractor, "invoice-origin-generic-v1", `goodsLines.${index}.origin extractor mismatch`);
        assert.equal(trace.evidence?.length, 1, `goodsLines.${index}.origin evidence count`);
        assert(trace.evidence[0]?.bbox, `goodsLines.${index}.origin bbox missing`);
        assert.equal(trace.evidence[0]?.text, line.origin, `goodsLines.${index}.origin evidence text mismatch`);
        assert(Number.isInteger(trace.evidence[0]?.pageNumber), `goodsLines.${index}.origin pageNumber missing`);
        return line.origin!.trim();
      });

      const exportResult = await exportDeclarationAsEvrimExcel(before.companyId, fixture.declarationId);
      assert.equal(exportResult.ready, true, `Evrim export not ready ${fixture.declarationId}`);
      if (!exportResult.ready) throw new Error(JSON.stringify(exportResult.issues));
      assert.equal(exportResult.rowCount, fixture.expectedLines);

      const excelOrigins = readEvrimOrigins(exportResult.buffer);
      assert.equal(excelOrigins.length, fixture.expectedLines);
      assert.deepEqual(excelOrigins, origins, `Evrim MENŞE mismatch ${fixture.declarationId}`);

      results.push({
        declarationId: fixture.declarationId,
        status: declaration.status,
        normalizedLines: normalized.goodsLines.length,
        originsPresent: origins.length,
        canonicalOriginTraceVerified: true,
        evrimExcelRows: exportResult.rowCount,
        evrimMenseMatchesNormalized: true,
        uniqueOrigins: [...new Set(origins)].sort(),
        sample: normalized.goodsLines.slice(0, 5).map((line, index) => ({
          lineNo: line.lineNo,
          productCode: line.productCode,
          origin: line.origin,
          evidence: declaration.sourceTrace?.[`goodsLines.${index}.origin`]?.evidence?.[0]
        }))
      });
    }

    console.log(JSON.stringify({
      event: "idp.invoice-origin.normalization-export.regression.passed",
      totalNormalizedLines: results.reduce((sum, item) => sum + item.normalizedLines, 0),
      totalEvrimRows: results.reduce((sum, item) => sum + item.evrimExcelRows, 0),
      results
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
