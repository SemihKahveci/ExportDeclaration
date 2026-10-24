import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { buildExportDeclarationContract } from "../../src/modules/export-contract/exportDeclarationContract.service.js";
import { buildDeclarationWorkbook } from "../../src/modules/evrim-excel/declarationWorkbook.js";
import type { NormalizedDeclaration } from "../../src/modules/normalization/normalizedDeclaration.types.js";

const normalized: NormalizedDeclaration = {
  header: { invoiceNo: "VED2026000000225", invoiceDate: "2026-08-13", currency: "EUR" },
  parties: {},
  trade: { deliveryTerm: "FCA" },
  transport: {},
  packageInfo: { totalPackage: 1, packageType: "Bin", grossKg: 12.5, netKg: 11 },
  goodsLines: [{
    lineNo: 1,
    productCode: "OG.RVT.BAR.24.040.065",
    description: "BAR-24V BAKIMSIZ AKULU REDRESOR",
    quantity: 1,
    unit: "Adet",
    unitPrice: 752,
    lineTotal: 752,
    hsCode: "853690950000",
    origin: "TR"
  }]
};

const workbook = buildDeclarationWorkbook(normalized, buildExportDeclarationContract(normalized));
const book = XLSX.read(workbook.buffer, { type: "buffer", cellDates: true });
const sheet = book.Sheets.Sayfa1!;
assert.equal(book.SheetNames.length, 1);
assert.equal(sheet.A1?.v, ".");
assert.equal(sheet.B1?.v, "BAR-24V BAKIMSIZ AKULU REDRESOR");
assert.equal(sheet.C1?.v, 1);
assert.equal(sheet.E1?.v, 752);
assert.equal(sheet.F1?.v, 752);
assert.equal(sheet.G1, undefined);
assert.equal(sheet.L1?.v, "853690950000");
assert.equal(sheet.L1?.t, "s");
assert.equal(sheet.Z1?.v, "OG.RVT.BAR.24.040.065");
assert.equal(sheet.K1?.v, "BI");
assert.equal(sheet.AW1?.v, "VED2026000000225");
assert.equal(String(sheet.A2?.v ?? ""), "");
const headerish = Object.values(sheet).some((cell) => typeof cell === "object" && cell && "v" in cell && cell.v === "Ticari Tanım");
assert.equal(headerish, false);
console.log("declaration workbook contract ok");
