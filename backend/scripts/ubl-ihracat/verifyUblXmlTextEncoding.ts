import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { decodeUblXmlBuffer, repairTurkishReplacementChars } from "../../src/modules/extraction/ubl/ublXmlTextEncoding.js";
import { parseUblIhracatInvoiceXml } from "../../src/modules/extraction/ubl/ublIhracatInvoice.parser.js";

assert.equal(repairTurkishReplacementChars("Vekmar Tic.A.\uFFFD."), "Vekmar Tic.A.Ş.");
assert.equal(repairTurkishReplacementChars("SOFï¿½A"), "SOFİA");
assert.equal(repairTurkishReplacementChars("\uFFFDSTANBUL"), "İSTANBUL");
assert.equal(repairTurkishReplacementChars("T\uFFFDRK\uFFFDYE"), "TÜRKİYE");

const paket = String.raw`C:\Users\Semih\Downloads\e-ihracat-evrim-paketi\e-ihracat-evrim-paketi\1-xml-faturalar`;
const vekmarPath = path.join(paket, "VED2026000000308-Vekmar.xml");
if (fs.existsSync(vekmarPath)) {
  const xml = decodeUblXmlBuffer(fs.readFileSync(vekmarPath));
  assert.ok(!xml.includes("ï¿½"), "latin5 mojibake kalmamalı");
  const parsed = parseUblIhracatInvoiceXml(xml);
  assert.match(String(parsed.seller?.name ?? ""), /A\.Ş\./);
  assert.match(String(parsed.seller?.address ?? ""), /İSTANBUL/);
  assert.match(String(parsed.buyer?.address ?? ""), /SOFİA/);
  console.log("vekmar repaired:", parsed.seller?.name, "|", parsed.seller?.address, "|", parsed.buyer?.address);
}

const celikelPath = path.join(paket, "CLK2026000001021-Celikel.xml");
if (fs.existsSync(celikelPath)) {
  const parsed = parseUblIhracatInvoiceXml(decodeUblXmlBuffer(fs.readFileSync(celikelPath)));
  assert.match(String(parsed.seller?.name ?? ""), /Çelikel/);
  assert.match(String(parsed.seller?.name ?? ""), /A\.Ş/);
  console.log("celikel ok:", parsed.seller?.name);
}

console.log("ubl xml text encoding ok");
