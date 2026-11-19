/**
 * e-ihracat paketi golden: XML parse → declarationWorkbook vs 2-evrim-excel.
 *
 *   npx tsx backend/scripts/evrim-excel/verifyUblPaketGolden.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { parseUblIhracatInvoiceXml } from "../../src/modules/extraction/ubl/ublIhracatInvoice.parser.js";
import { applyManufacturerRules, enrichInvoiceFromNotes } from "../../src/modules/extraction/ubl/ublIhracatNoteRules.js";
import { buildDeclarationWorkbook } from "../../src/modules/evrim-excel/declarationWorkbook.js";
import { buildExportDeclarationContract } from "../../src/modules/export-contract/exportDeclarationContract.service.js";
import type { NormalizedDeclaration } from "../../src/modules/normalization/normalizedDeclaration.types.js";

const DEFAULT_PAKET = String.raw`C:\Users\Semih\Downloads\e-ihracat-evrim-paketi\e-ihracat-evrim-paketi`;
const paketRoot = process.env.EVRIM_PAKET_ROOT?.trim() || DEFAULT_PAKET;

/** Paket dokümanındaki bilinen gönderici Evrim ID’leri (VKN → ID). */
const SENDER_BY_INVOICE_PREFIX: Record<string, number> = {
  PKA: 3307,
  EVX: 2493,
  CLK: 2185,
  IHR: 0, // Adin 17 / Makro 1869 — dosya adına göre
  VED: 3206,
};

const SENDER_BY_FILE: Record<string, number> = {
  "PKA2026000000142-PAG.xml": 3307,
  "EVX2026000000016-Evax.xml": 2493,
  "CLK2026000001021-Celikel.xml": 2185,
  "CLK2026000002193-Celikel.xml": 2185,
  "IHR2026000000158-Adin.xml": 17,
  "TEST-IHR2026000000158-Adin-coklu-mense.xml": 17,
  "IHR2026000000035-MakroBoya.xml": 1869,
  "VED2026000000308-Vekmar.xml": 3206,
  "TEST-VED2026000000308-Vekmar-CIF.xml": 3206,
};

/** Evax imalatçı VKN → Evrim ID (doküman §5.9). */
const MANUFACTURER_BY_VKN: Record<string, number> = {
  "1400384363": 2504,
  "8371251344": 3045,
  "14378609154": 2556,
  "0010700319": 2557,
  "43027253400": 2668,
  "3361258399": 2616,
  "52900714020": 2666,
  "6180397999": 3344,
};

type Diff = { file: string; row: number; col: string; expected: unknown; actual: unknown };

const COL = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","AA","AB","AC"];

function cellEqual(expected: unknown, actual: unknown): boolean {
  if (expected === "" || expected == null) return actual === "" || actual == null || actual === undefined;
  if (typeof expected === "number" && typeof actual === "number") {
    return Math.abs(expected - actual) < 1e-6;
  }
  if (typeof expected === "number" && typeof actual === "string") {
    return Math.abs(expected - Number(actual)) < 1e-6;
  }
  return String(expected).trim() === String(actual ?? "").trim();
}

function readXmlText(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  const head = buf.subarray(0, 180).toString("ascii");
  const encoding = (head.match(/encoding\s*=\s*["']([^"']+)["']/i)?.[1] ?? "utf-8").toLowerCase();
  if (encoding.includes("iso-8859-9") || encoding.includes("windows-1254") || encoding.includes("latin5")) {
    return new TextDecoder("windows-1254").decode(buf);
  }
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString("utf8");
  return buf.toString("utf8");
}

function toNormalized(xmlPath: string, senderEvrimId: number): NormalizedDeclaration {
  const xml = readXmlText(xmlPath);
  const parsed = enrichInvoiceFromNotes(parseUblIhracatInvoiceXml(xml));
  const lines = applyManufacturerRules(parsed, {
    senderEvrimId,
    lookupManufacturer: (taxNo) => MANUFACTURER_BY_VKN[taxNo],
  });
  return {
    header: {
      invoiceNo: parsed.invoiceNo,
      invoiceDate: parsed.invoiceDate,
      currency: parsed.currency,
      totalAmount: parsed.totalAmount,
    },
    parties: {
      seller: parsed.seller ? { name: parsed.seller.name, taxNo: parsed.seller.taxNo, country: parsed.seller.countryCode } : undefined,
      buyer: parsed.buyer ? { name: parsed.buyer.name, country: parsed.buyer.countryCode } : undefined,
    },
    trade: { deliveryTerm: parsed.deliveryTerm, paymentType: parsed.paymentType },
    transport: { mode: parsed.transportMode },
    packageInfo: {
      packageType: parsed.packageType,
      totalPackage: parsed.totalPackage,
      grossKg: parsed.grossKg,
      netKg: parsed.netKg,
    },
    finance: parsed.bankInfo ? { bankInfo: parsed.bankInfo } : undefined,
    goodsLines: lines.map((line) => ({
      lineNo: line.lineNo,
      hsCode: line.hsCode,
      productCode: line.productCode,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
      origin: line.origin,
      netKg: line.netKg,
      packageType: line.packageType,
      manufacturerNo: line.manufacturerNo,
      manufacturerType: line.manufacturerType,
      invoiceNo: parsed.invoiceNo,
    })),
  };
}

function compare(fileXml: string): Diff[] {
  const xmlPath = path.join(paketRoot, "1-xml-faturalar", fileXml);
  const excelName = fileXml.replace(/\.xml$/i, "-evrim.xlsx");
  const excelPath = path.join(paketRoot, "2-evrim-excel", excelName);
  assert.ok(fs.existsSync(xmlPath), `XML yok: ${xmlPath}`);
  assert.ok(fs.existsSync(excelPath), `Excel yok: ${excelPath}`);

  const sender = SENDER_BY_FILE[fileXml] ?? SENDER_BY_INVOICE_PREFIX[fileXml.slice(0, 3)] ?? 0;
  const normalized = toNormalized(xmlPath, sender);
  const produced = buildDeclarationWorkbook(normalized, buildExportDeclarationContract(normalized), { senderEvrimId: sender });
  const actualRows = XLSX.utils.sheet_to_json(XLSX.read(produced.buffer, { type: "buffer" }).Sheets.Sayfa1!, { header: 1, defval: "" }) as unknown[][];
  const expectedRows = XLSX.utils.sheet_to_json(XLSX.readFile(excelPath).Sheets.Sayfa1!, { header: 1, defval: "" }) as unknown[][];

  const diffs: Diff[] = [];
  if (actualRows.length !== expectedRows.length) {
    diffs.push({ file: fileXml, row: -1, col: "ROWS", expected: expectedRows.length, actual: actualRows.length });
  }
  const max = Math.max(actualRows.length, expectedRows.length);
  for (let r = 0; r < max; r++) {
    const exp = expectedRows[r] ?? [];
    const act = actualRows[r] ?? [];
    const width = Math.max(exp.length, act.length, 28);
    for (let c = 0; c < width; c++) {
      if (c === 9 || c === 22 || c === 26) continue; // J/W/AA yazılmaz
      const e = exp[c] ?? "";
      const a = act[c] ?? "";
      if (!cellEqual(e, a)) {
        diffs.push({ file: fileXml, row: r + 1, col: COL[c] ?? String(c), expected: e, actual: a });
      }
    }
  }
  return diffs;
}

function main() {
  if (!fs.existsSync(paketRoot)) {
    throw new Error(`Paket klasörü yok: ${paketRoot}`);
  }
  const xmlFiles = fs.readdirSync(path.join(paketRoot, "1-xml-faturalar")).filter((f) => f.endsWith(".xml")).sort();
  const all: Diff[] = [];
  for (const file of xmlFiles) {
    const diffs = compare(file);
    const structural = diffs.filter((d) => !["P", "T", "I"].includes(d.col) || d.row < 0);
    console.log(`[golden] ${file}: ${diffs.length} diff (structural-ish ${structural.length})`);
    if (diffs.length && diffs.length <= 12) {
      for (const d of diffs.slice(0, 12)) console.log("  ", d);
    } else if (diffs.length > 12) {
      for (const d of diffs.slice(0, 8)) console.log("  ", d);
      console.log(`  ... +${diffs.length - 8} more`);
    }
    all.push(...diffs);
  }

  // Sert kapı: satır sayısı, GTİP, miktar, birim, FOB/CIF, mal kodu, fatura no
  const hard = all.filter((d) => d.row < 0 || ["C", "D", "E", "F", "G", "H", "L", "Q", "V", "X", "Y", "AB"].includes(d.col));
  console.log(`\n[golden] total diffs=${all.length}, hard=${hard.length}`);
  if (hard.length > 0) {
    console.error("[golden] HARD FAIL");
    for (const d of hard.slice(0, 30)) console.error(d);
    process.exit(1);
  }
  console.log("[golden] HARD PASS (mense/imalatçı soft diff olabilir)");
}

main();
