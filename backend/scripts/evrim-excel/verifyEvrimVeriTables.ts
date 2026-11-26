import assert from "node:assert/strict";
import {
  loadEvrimVeriTables,
  lookupEvrimCountryNoFromTables,
  lookupEvrimFirmaNoByVkn,
  lookupEvrimPackageTypeFromTables,
  lookupEvrimQuantityUnitFromTables,
  matchEvrimAliciForMusteri,
  resetEvrimVeriTablesCache,
  resolveEvrimVeriXlsxPath,
  searchEvrimAliciForMusteri,
  searchEvrimGonderen,
} from "../../src/modules/export-code-tables/evrimVeriTables.js";
import { mapEvrimCountryNo } from "../../src/modules/export-code-tables/evrimCountryCodes.js";
import {
  labelEvrimQuantityUnit,
  mapEvrimIhracatQuantityUnit,
  mapEvrimPackageType,
} from "../../src/modules/export-code-tables/exportCodeTables.js";

resetEvrimVeriTablesCache();
const path = resolveEvrimVeriXlsxPath();
assert.ok(path, "evrim-veri.xlsx bulunamadı");
const tables = loadEvrimVeriTables();
assert.ok(tables);
assert.ok(tables!.firmaByVkn.size > 100);
assert.ok(tables!.aliciByMusteriNo.size > 100);
assert.ok(tables!.menseByCode.size > 50);
assert.ok(tables!.kapByKod.size > 50);
assert.ok(tables!.miktarByEdi.size > 5);

assert.equal(lookupEvrimFirmaNoByVkn("9240241537"), 3206);
assert.equal(lookupEvrimFirmaNoByVkn("0080765290"), 17);
assert.equal(lookupEvrimFirmaNoByVkn("1400384363"), 2504);
assert.equal(lookupEvrimCountryNoFromTables("FRANCE"), "001");
assert.equal(lookupEvrimCountryNoFromTables("TÜRKİYE"), "052");
assert.equal(lookupEvrimCountryNoFromTables("GR"), "009");
assert.equal(lookupEvrimQuantityUnitFromTables("NIU"), "C62");
assert.equal(lookupEvrimQuantityUnitFromTables("EA"), "C62");
assert.equal(lookupEvrimQuantityUnitFromTables("KGM"), "KGM");
assert.equal(lookupEvrimPackageTypeFromTables("BX"), "BX");
assert.equal(lookupEvrimPackageTypeFromTables("BI"), "BI");

assert.equal(mapEvrimCountryNo("CHINA"), "720");
assert.equal(mapEvrimIhracatQuantityUnit("niu"), "C62");
assert.equal(mapEvrimPackageType("BX"), "BX");
assert.equal(labelEvrimQuantityUnit("EA"), "Adet");
assert.equal(labelEvrimQuantityUnit("NIU"), "Adet");
assert.equal(labelEvrimQuantityUnit("KGM"), "Kilogram");
assert.equal(mapEvrimIhracatQuantityUnit("EA"), "C62");

const gonderen = searchEvrimGonderen("3206");
assert.ok(gonderen.some((row) => row.gonderenNo === 3206));

// Noktalama / kısmi unvan: fatura "San ve Tic. A.Ş" ↔ Excel "SAN. VE TİC.A.Ş."
const celikelFull = searchEvrimGonderen("Çelikel Alüminyum Döküm İmalat San ve Tic. A.Ş");
assert.ok(celikelFull.some((row) => row.gonderenNo === 2185), "tam unvan (noktalama farkı) → 2185");
const celikelShort = searchEvrimGonderen("Çelikel Alüminyum");
assert.ok(celikelShort.some((row) => row.gonderenNo === 2185), "kısmi unvan → 2185");
assert.equal(lookupEvrimFirmaNoByVkn("2410053479", "Çelikel Alüminyum"), 2185);

const alicilar = searchEvrimAliciForMusteri(3206, "");
assert.ok(alicilar.length > 0);
const unmatched = matchEvrimAliciForMusteri(3206, "BU ALICI YOK XYZ");
assert.equal(unmatched.status, "not_found");

console.log("evrim-veri tables ok", {
  path: tables!.sourcePath,
  firma: tables!.firmaByNo.size,
  aliciMusteri: tables!.aliciByMusteriNo.size,
  miktar: tables!.miktarByEdi.size,
  kap: tables!.kapByKod.size,
  mense: tables!.menseByCode.size,
});
