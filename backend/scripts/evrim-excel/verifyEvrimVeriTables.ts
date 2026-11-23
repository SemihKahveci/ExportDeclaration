import assert from "node:assert/strict";
import {
  loadEvrimVeriTables,
  lookupEvrimCountryNoFromTables,
  lookupEvrimFirmaNoByVkn,
  lookupEvrimPackageTypeFromTables,
  lookupEvrimQuantityUnitFromTables,
  resolveEvrimVeriXlsxPath,
} from "../../src/modules/export-code-tables/evrimVeriTables.js";
import { mapEvrimCountryNo } from "../../src/modules/export-code-tables/evrimCountryCodes.js";
import { mapEvrimIhracatQuantityUnit, mapEvrimPackageType } from "../../src/modules/export-code-tables/exportCodeTables.js";

const path = resolveEvrimVeriXlsxPath();
assert.ok(path, "evrim-veri.xlsx bulunamadı");
const tables = loadEvrimVeriTables();
assert.ok(tables);
assert.ok(tables!.firmaByVkn.size > 100);
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

console.log("evrim-veri tables ok", tables!.sourcePath);
