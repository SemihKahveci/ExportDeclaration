import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import mongoose from "mongoose";
import * as XLSX from "xlsx";
import { env } from "../../src/config/env.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import type { NormalizedDeclaration } from "../../src/modules/normalization/normalizedDeclaration.types.js";
import { buildExportDeclarationContract } from "../../src/modules/export-contract/exportDeclarationContract.service.js";
import { buildEvrimExcel, toEvrimPackageType } from "../../src/modules/evrim-excel/evrimExcelAdapter.service.js";
import { EVRIM_EXCEL_HEADERS } from "../../src/modules/evrim-excel/evrimExcelAdapter.types.js";

const fixtures = [
  { declarationId: "6aad3237ca6e4f9c2d1554f5", expectedLines: 56 },
  { declarationId: "6aad3295ca6e4f9c2d155507", expectedLines: 41 }
];

async function main(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  try {
    assert.equal(toEvrimPackageType("Bin"), "BI");
    assert.equal(toEvrimPackageType("PALLET"), "PALLET");

    await mkdir("/tmp/evrim-excel-regression", { recursive: true });
    const results = [];

    for (const fixture of fixtures) {
      const declaration = await DeclarationModel.findById(fixture.declarationId).lean();
      assert.ok(declaration, `Declaration not found: ${fixture.declarationId}`);
      const normalized = declaration.normalizedData as NormalizedDeclaration;
      assert.ok(normalized, `NormalizedDeclaration missing: ${fixture.declarationId}`);

      const contract = buildExportDeclarationContract(normalized);
      const result = buildEvrimExcel(contract);
      assert.equal(result.rowCount, fixture.expectedLines);

      const workbook = XLSX.read(result.buffer, { type: "buffer", cellDates: true });
      assert.deepEqual(workbook.SheetNames, ["Sayfa1", "Sayfa2"]);
      const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Sayfa1, { header: 1, defval: "" });
      const utsRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Sayfa2, { header: 1, defval: "" });

      assert.deepEqual(rows[0], Array.from(EVRIM_EXCEL_HEADERS));
      assert.equal(rows.length - 1, fixture.expectedLines);
      assert.equal(utsRows.length - 1, fixture.expectedLines);
      assert.equal(rows[1]?.[8], "BI");
      assert.equal(rows[1]?.[0], contract.lines[0]?.productCode);
      assert.equal(String(rows[1]?.[4]), contract.lines[0]?.hsCode);
      assert.equal(rows[1]?.[10], contract.lines[0]?.description);
      assert.equal(rows[1]?.[7], contract.package.totalPackage);

      const output = `/tmp/evrim-excel-regression/${fixture.declarationId}.xlsx`;
      await writeFile(output, result.buffer);
      results.push({
        declarationId: fixture.declarationId,
        lineCount: result.rowCount,
        packageType: rows[1]?.[8],
        sheets: workbook.SheetNames,
        output
      });
    }

    const synthetic = buildExportDeclarationContract({
      header: { invoiceNo: "TEST-1", invoiceDate: "2026-09-19", currency: "EUR" },
      parties: {},
      trade: { deliveryTerm: "FCA" },
      transport: {},
      packageInfo: { totalPackage: 2, packageType: "Bin", grossKg: 10, netKg: 9 },
      goodsLines: [{ lineNo: 1, hsCode: "853620900019", productCode: "AG.TEST.1", description: "TEST PRODUCT", quantity: 2, unit: "Adet", unitPrice: 5, lineTotal: 10 }]
    });
    const enriched = buildEvrimExcel(synthetic, {
      lineOverrides: {
        "product:AG.TEST.1": {
          originCode: "004", customsDescription: "REAKTİF", utsNo: "04250317515100",
          exemptionCode: "KKDFM", exemptionCode2: "UTSK8", brandName: "TEST BRAND",
          manufacturerNo: 1373, brand: "TEST BRAND", usedFlag: "K1", orderType: "9-Diğer",
          orderRegistration: "0-Tescilsiz", prePermit: "Tareks", discount: 2.5
        }
      }
    });
    const enrichedWb = XLSX.read(enriched.buffer, { type: "buffer", cellDates: true });
    const enrichedRows = XLSX.utils.sheet_to_json<unknown[]>(enrichedWb.Sheets.Sayfa1, { header: 1, defval: "" });
    assert.equal(enrichedRows[1]?.[5], "004");
    assert.equal(enrichedRows[1]?.[6], "REAKTİF");
    assert.equal(enrichedRows[1]?.[8], "BI");
    assert.equal(enrichedRows[1]?.[9], "04250317515100");
    assert.equal(enrichedRows[1]?.[11], "KKDFM");
    assert.equal(enrichedRows[1]?.[12], "UTSK8");
    assert.equal(enrichedRows[1]?.[13], "FCA");
    assert.equal(enrichedRows[1]?.[22], "Tareks");
    assert.equal(enrichedRows[1]?.[23], 2.5);

    console.log(JSON.stringify({ event: "evrim.excel-adapter.regression.passed", referenceColumns: EVRIM_EXCEL_HEADERS.length, results, overrideMapping: true }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ event: "evrim.excel-adapter.regression.failed", error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
});
