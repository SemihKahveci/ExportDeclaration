import assert from "node:assert/strict";
import mongoose from "mongoose";
import * as XLSX from "xlsx";
import { env } from "../../src/config/env.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { exportDeclarationAsEvrimExcel } from "../../src/modules/declaration-exports/declarationExport.service.js";

const REAL_DECLARATIONS = [
  { id: "6aad3237ca6e4f9c2d1554f5", expectedLines: 56 },
  { id: "6aad3295ca6e4f9c2d155507", expectedLines: 41 }
] as const;

async function main(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  try {
    const results = [];
    for (const fixture of REAL_DECLARATIONS) {
      const row = await DeclarationModel.findById(fixture.id).lean();
      assert(row, `Fixture declaration not found: ${fixture.id}`);
      const result = await exportDeclarationAsEvrimExcel(row.companyId, fixture.id);
      assert.equal(result.ready, true, `Export must be ready: ${fixture.id}`);
      if (!result.ready) throw new Error("unreachable");
      assert.equal(result.rowCount, fixture.expectedLines);
      assert.match(result.filename, /-evrim\.xlsx$/);
      const workbook = XLSX.read(result.buffer, { type: "buffer", cellDates: true });
      assert.deepEqual(workbook.SheetNames, ["Sayfa1", "Sayfa2"]);
      const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Sayfa1!, { header: 1 });
      assert.equal(rows.length - 1, fixture.expectedLines);
      results.push({ declarationId: fixture.id, rowCount: result.rowCount, filename: result.filename });
    }

    const source = await DeclarationModel.findById(REAL_DECLARATIONS[0].id).lean();
    assert(source?.normalizedData);
    const temp = await DeclarationModel.create({
      companyId: source.companyId,
      createdBy: source.createdBy,
      status: source.status,
      operation: source.operation,
      normalizedData: { ...(source.normalizedData as Record<string, unknown>), packageInfo: {} }
    });
    try {
      const blocked = await exportDeclarationAsEvrimExcel(source.companyId, String(temp._id));
      assert.equal(blocked.ready, false);
      if (blocked.ready) throw new Error("unreachable");
      assert(blocked.issues.some((i) => i.path === "package.totalPackage"));
    } finally {
      await DeclarationModel.deleteOne({ _id: temp._id });
    }

    console.log(JSON.stringify({ event: "evrim.excel-export-service.regression.passed", results, failClosed: true }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
