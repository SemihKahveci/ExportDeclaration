import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { buildExportDeclarationContract } from "../../src/modules/export-contract/exportDeclarationContract.service.js";
import type { NormalizedDeclaration } from "../../src/modules/normalization/normalizedDeclaration.types.js";
import { buildUnsignedUblIhracat } from "../../src/modules/ubl-ihracat/ublIhracatAdapter.service.js";

const FIXTURES = [
  { declarationId: "6aad3237ca6e4f9c2d1554f5", expectedLines: 56, uuid: "11111111-1111-4111-8111-111111111111" },
  { declarationId: "6aad3295ca6e4f9c2d155507", expectedLines: 41, uuid: "22222222-2222-4222-8222-222222222222" }
];

async function main(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  const results: unknown[] = [];

  for (const fixture of FIXTURES) {
    const declaration = await DeclarationModel.findById(fixture.declarationId);
    assert.ok(declaration?.normalizedData, `normalized declaration missing: ${fixture.declarationId}`);
    const contract = buildExportDeclarationContract(declaration.normalizedData as NormalizedDeclaration);
    assert.equal(contract.readiness.ready, true, JSON.stringify(contract.readiness.issues));

    const out = buildUnsignedUblIhracat(contract, { uuid: fixture.uuid });
    assert.equal(out.ready, true, out.ready ? undefined : JSON.stringify(out.issues));
    if (!out.ready) continue;

    assert.equal(out.lineCount, fixture.expectedLines);
    assert.match(out.xml, /<cbc:UBLVersionID>2\.1<\/cbc:UBLVersionID>/);
    assert.match(out.xml, /<cbc:CustomizationID>TR1\.2<\/cbc:CustomizationID>/);
    assert.match(out.xml, /<cbc:ProfileID>IHRACAT<\/cbc:ProfileID>/);
    assert.match(out.xml, /<cbc:RequiredCustomsID>\d{12}<\/cbc:RequiredCustomsID>/);
    assert.match(out.xml, /<cbc:ID schemeID="INCOTERMS">[^<]+<\/cbc:ID>/);
    assert.match(out.xml, /<cbc:TransportModeCode>3<\/cbc:TransportModeCode>/);
    assert.match(out.xml, /unitCode="C62"/);
    assert.equal(out.xml.includes("ds:Signature"), false);
    assert.equal(out.xml.includes("xades:"), false);
    assert.equal(out.xml.includes("X509Certificate"), false);
    assert.equal(out.xml.includes("EmbeddedDocumentBinaryObject"), false);

    const lineTags = out.xml.match(/<cac:InvoiceLine>/g) ?? [];
    assert.equal(lineTags.length, fixture.expectedLines);
    results.push({ declarationId: fixture.declarationId, lineCount: out.lineCount, profileId: out.profileId, signed: out.signed });
  }

  const base = await DeclarationModel.findById(FIXTURES[0]!.declarationId);
  assert.ok(base?.normalizedData);
  const failContract = buildExportDeclarationContract(base.normalizedData as NormalizedDeclaration);
  const fail = buildUnsignedUblIhracat(failContract, { uuid: "copied-or-invalid" });
  assert.equal(fail.ready, false);
  assert.ok(!fail.ready && fail.issues.some((i) => i.path === "options.uuid"));

  console.log(JSON.stringify({ event: "ubl-ihracat.unsigned-adapter.regression.passed", results, copiedSignatureMaterial: false, invalidUuidFailClosed: true }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await mongoose.disconnect();
});
