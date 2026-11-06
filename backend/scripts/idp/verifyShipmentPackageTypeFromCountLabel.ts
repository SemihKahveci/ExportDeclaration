/**
 * Dilim 3: count labels that name the packaging kind must also emit packageType.
 */
import assert from "node:assert/strict";
import {
  discoverInvoiceShipmentFieldCandidates,
  packageTypeFromCountEvidence,
} from "../../src/modules/idp/candidates/invoiceShipmentCandidateDiscovery.js";
import type { CanonicalDocument, CanonicalPage, CanonicalWord } from "../../src/modules/idp/domain/canonicalDocument.types.js";

assert.equal(packageTypeFromCountEvidence("PALET SAYISI: 21"), "PALET");
assert.equal(packageTypeFromCountEvidence("TOTAL CARTONS: 5"), "CARTON");
assert.equal(packageTypeFromCountEvidence("PALLET COUNT 3"), "PALLET");
assert.equal(packageTypeFromCountEvidence("KOLI ADEDI: 12"), "KOLI");
assert.equal(packageTypeFromCountEvidence("TOPLAM KAP: 66"), undefined);
assert.equal(packageTypeFromCountEvidence("KAP SAYISI 4"), undefined);

const word = (text: string, x0: number, y0: number, x1: number, y1: number): CanonicalWord => ({
  text, bbox: { x0, y0, x1, y1 }, confidence: 1, source: "NATIVE_TEXT",
});
const mkPage = (lines: string[]): CanonicalPage => ({
  pageNumber: 1, width: 1000, height: 1000, rotation: 0,
  nativeText: lines.join("\n"),
  nativeCharCount: lines.join(" ").length,
  nativeWordCount: lines.length,
  hasNativeText: true, imageCount: 0, imageCoverage: 0, contentKind: "DIGITAL",
  words: lines.flatMap((text, i) =>
    text.split(/\s+/).map((t, j) => word(t, 0.05 + j * 0.08, 0.05 + i * 0.07, 0.11 + j * 0.08, 0.07 + i * 0.07))),
  lines: lines.map((text, i) => ({
    text, bbox: { x0: 0.04, y0: 0.05 + i * 0.07, x1: 0.95, y1: 0.07 + i * 0.07 }, source: "NATIVE_TEXT",
  })),
});
const doc = (lines: string[]): CanonicalDocument => ({
  schemaVersion: "1.0",
  source: {},
  analysis: {
    contentKind: "DIGITAL", pageCount: 1, digitalPageCount: 1, scannedPageCount: 0,
    mixedPageCount: 0, nativeTextPageCount: 1,
  },
  pages: [mkPage(lines)],
});
const value = (env: { fields: Record<string, Array<{ value: unknown }>> }, field: string) =>
  env.fields[field]?.[0]?.value;

const palet = discoverInvoiceShipmentFieldCandidates(doc(["PALET SAYISI: 21", "BRUT KG: 26020"]), "seg");
assert.equal(value(palet, "packageInfo.totalPackage"), 21);
assert.equal(value(palet, "packageInfo.packageType"), "PALET");

const cartons = discoverInvoiceShipmentFieldCandidates(doc(["TOTAL CARTONS: 5"]), "seg");
assert.equal(value(cartons, "packageInfo.totalPackage"), 5);
assert.equal(value(cartons, "packageInfo.packageType"), "CARTON");

const explicit = discoverInvoiceShipmentFieldCandidates(doc(["PACKAGE TYPE: BIN", "TOPLAM KAP: 2"]), "seg");
assert.equal(value(explicit, "packageInfo.totalPackage"), 2);
assert.equal(value(explicit, "packageInfo.packageType"), "BIN");

const dual = discoverInvoiceShipmentFieldCandidates(doc(["TOPLAM KAP : 66 PALET"]), "seg");
assert.equal(value(dual, "packageInfo.totalPackage"), 66);
assert.equal(value(dual, "packageInfo.packageType"), "PALET");

console.log("verifyShipmentPackageTypeFromCountLabel: ok");
