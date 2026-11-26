import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { buildExportDeclarationContract } from "../../src/modules/export-contract/exportDeclarationContract.service.js";
import { buildDeclarationWorkbook } from "../../src/modules/evrim-excel/declarationWorkbook.js";
import type { NormalizedDeclaration } from "../../src/modules/normalization/normalizedDeclaration.types.js";

const normalized: NormalizedDeclaration = {
  header: { invoiceNo: "VED2026000000225", invoiceDate: "2026-08-13", currency: "EUR", totalAmount: 752 },
  parties: {},
  trade: { deliveryTerm: "FCA" },
  transport: {},
  packageInfo: { totalPackage: 1, packageType: "Bin", grossKg: 12.5, netKg: 11 },
  goodsLines: [{
    lineNo: 1,
    productCode: "OG.RVT.BAR.24.040.065",
    description: "BAR-24V BAKIMSIZ AKULU REDRESOR",
    quantity: 1,
    unit: "EA",
    unitPrice: 752,
    lineTotal: 752,
    hsCode: "853690950000",
    origin: "FRANCE",
    packageType: "BI",
    manufacturerNo: 3206,
    manufacturerType: "T",
  }]
};

const workbook = buildDeclarationWorkbook(normalized, buildExportDeclarationContract(normalized), { senderEvrimId: 3206 });
const book = XLSX.read(workbook.buffer, { type: "buffer" });
const sheet = book.Sheets.Sayfa1!;
assert.equal(book.SheetNames.length, 1);
assert.equal(sheet.A1?.v, ".");
assert.equal(sheet.B1?.v, "BAR-24V BAKIMSIZ AKULU REDRESOR");
assert.equal(sheet.C1?.v, 1);
assert.equal(sheet.D1?.v, "C62");
assert.equal(sheet.E1?.v, 752);
assert.equal(sheet.F1?.v, 752);
assert.equal(String(sheet.G1?.v ?? ""), "");
assert.equal(sheet.I1?.v, "001");
assert.equal(sheet.I1?.t, "s");
assert.equal(sheet.K1?.v, "BI");
assert.equal(sheet.L1?.v, "853690950000");
assert.equal(sheet.L1?.t, "s");
assert.equal(sheet.P1?.v, 3206);
assert.equal(sheet.Q1?.v, "OG.RVT.BAR.24.040.065");
assert.equal(sheet.T1?.v, "T");
assert.equal(sheet.V1?.v, "VED2026000000225");
assert.equal(sheet.X1?.v, "EUR");
assert.equal(sheet.Y1?.v, 752);
assert.equal(sheet.AB1?.v, "VED2026000000225");
assert.equal(String(sheet.A2?.v ?? ""), "");
const headerish = Object.values(sheet).some((cell) => typeof cell === "object" && cell && "v" in cell && cell.v === "Ticari Tanım");
assert.equal(headerish, false);

// Baştaki 0 sayı formatında kaybolmasın — L metin kalsın
const leadingZero: NormalizedDeclaration = {
  ...normalized,
  goodsLines: [{ ...normalized.goodsLines![0]!, hsCode: "012345678901" }],
};
const wbZero = buildDeclarationWorkbook(leadingZero, buildExportDeclarationContract(leadingZero), { senderEvrimId: 3206 });
const sheetZero = XLSX.read(wbZero.buffer, { type: "buffer" }).Sheets.Sayfa1!;
assert.equal(sheetZero.L1?.v, "012345678901");
assert.equal(sheetZero.L1?.t, "s");
assert.notEqual(typeof sheetZero.L1?.v, "number");

const withAyar = buildDeclarationWorkbook(normalized, buildExportDeclarationContract(normalized), {
  senderEvrimId: 3206,
  kapKaynak: "sabit",
  kapSabit: "bx",
  ambalaj: "ADDR",
});
const sheetAyar = XLSX.read(withAyar.buffer, { type: "buffer" }).Sheets.Sayfa1!;
assert.equal(sheetAyar.K1?.v, "BX");
assert.equal(sheetAyar.W1?.v, "ADDR");

console.log("declaration workbook contract ok");
