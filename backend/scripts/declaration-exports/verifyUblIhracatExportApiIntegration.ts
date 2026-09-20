import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";

const API_BASE =
  process.env.UBL_EXPORT_TEST_API_BASE ?? "http://backend:3000";
const email = process.env.SUPERADMIN_EMAIL;
const password = process.env.SUPERADMIN_PASSWORD;

const fixtures = [
  {
    declarationId: "6aad3237ca6e4f9c2d1554f5",
    expectedLines: 56,
    invoiceNo: "VED2026000000146",
    uuid: "11111111-1111-4111-8111-111111111146",
  },
  {
    declarationId: "6aad3295ca6e4f9c2d155507",
    expectedLines: 41,
    invoiceNo: "VED2026000000110",
    uuid: "11111111-1111-4111-8111-111111111110",
  },
] as const;

if (!email || !password) {
  throw new Error("SUPERADMIN_EMAIL ve SUPERADMIN_PASSWORD integration testi için gerekli.");
}

async function responseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try { return JSON.parse(text); } catch { return text; }
}

function countInvoiceLines(xml: string): number {
  return (xml.match(/<cac:InvoiceLine>/g) ?? []).length;
}

function assertUnsigned(xml: string): void {
  const forbidden = [
    "<ds:Signature",
    "<SignatureValue",
    "<DigestValue",
    "<X509Certificate",
    "xades:",
    "<cac:Signature",
  ];
  for (const token of forbidden) {
    assert.equal(xml.includes(token), false, `Unsigned UBL imza materyali içeremez: ${token}`);
  }
}

async function main(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  let notReadyFixtureId: mongoose.Types.ObjectId | undefined;

  try {
    if (!env.installationCompanyId || !mongoose.isValidObjectId(env.installationCompanyId)) {
      throw new Error("INSTALLATION_COMPANY_ID integration testi için geçerli bir ObjectId olmalı.");
    }
    const companyId = new mongoose.Types.ObjectId(env.installationCompanyId);

    const unauthenticated = await fetch(
      `${API_BASE}/api/declarations/${fixtures[0].declarationId}/exports/ubl-ihracat`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ uuid: fixtures[0].uuid }),
      }
    );
    assert.equal(unauthenticated.status, 401, "UBL export endpoint oturumsuz erişime kapalı olmalı.");

    const login = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const loginBody = await responseBody(login);
    assert.equal(login.status, 200, `Login failed: ${JSON.stringify(loginBody)}`);
    const setCookie = login.headers.get("set-cookie");
    assert.ok(setCookie, "Login response Set-Cookie içermiyor.");
    const cookie = setCookie.split(";", 1)[0]!;

    const missingUuid = await fetch(
      `${API_BASE}/api/declarations/${fixtures[0].declarationId}/exports/ubl-ihracat`,
      {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: "{}",
      }
    );
    assert.equal(missingUuid.status, 400, "UUID olmadan UBL export 400 dönmeli.");

    const invalidUuid = await fetch(
      `${API_BASE}/api/declarations/${fixtures[0].declarationId}/exports/ubl-ihracat`,
      {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ uuid: "not-a-valid-uuid" }),
      }
    );
    const invalidUuidBody = await responseBody(invalidUuid) as any;
    assert.equal(invalidUuid.status, 409, `Geçersiz UUID fail-closed olmalı: ${JSON.stringify(invalidUuidBody)}`);
    assert.equal(invalidUuidBody?.code, "EXPORT_NOT_READY");

    const results: Array<Record<string, unknown>> = [];

    for (const fixture of fixtures) {
      const response = await fetch(
        `${API_BASE}/api/declarations/${fixture.declarationId}/exports/ubl-ihracat`,
        {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({ uuid: fixture.uuid }),
        }
      );

      if (response.status !== 200) {
        const errorBody = await responseBody(response);
        assert.fail(`UBL export failed for ${fixture.declarationId}: status=${response.status} body=${JSON.stringify(errorBody)}`);
      }

      assert.match(response.headers.get("content-type") ?? "", /^application\/xml(?:;\s*charset=utf-8)?$/i);
      assert.match(
        response.headers.get("content-disposition") ?? "",
        /^attachment; filename=".+-ubl-ihracat\.xml"$/
      );
      assert.equal(response.headers.get("x-export-row-count"), String(fixture.expectedLines));
      assert.equal(response.headers.get("x-ubl-profile"), "IHRACAT");
      assert.equal(response.headers.get("x-ubl-signed"), "false");

      const xml = await response.text();
      assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
      assert.ok(xml.includes("<cbc:UBLVersionID>2.1</cbc:UBLVersionID>"));
      assert.ok(xml.includes("<cbc:CustomizationID>TR1.2</cbc:CustomizationID>"));
      assert.ok(xml.includes("<cbc:ProfileID>IHRACAT</cbc:ProfileID>"));
      assert.ok(xml.includes(`<cbc:ID>${fixture.invoiceNo}</cbc:ID>`));
      assert.ok(xml.includes(`<cbc:UUID>${fixture.uuid}</cbc:UUID>`));
      assert.equal(countInvoiceLines(xml), fixture.expectedLines);
      assertUnsigned(xml);

      results.push({
        declarationId: fixture.declarationId,
        status: response.status,
        invoiceNo: fixture.invoiceNo,
        lineCount: countInvoiceLines(xml),
        profileId: response.headers.get("x-ubl-profile"),
        signed: response.headers.get("x-ubl-signed"),
        contentType: response.headers.get("content-type"),
        contentDisposition: response.headers.get("content-disposition"),
      });
    }

    notReadyFixtureId = new mongoose.Types.ObjectId();
    await DeclarationModel.create({
      _id: notReadyFixtureId,
      companyId,
      normalizedData: {
        header: {
          invoiceNo: "UBL-HTTP-NOT-READY",
          invoiceDate: new Date("2026-09-20T00:00:00Z"),
          currency: "EUR",
        },
        parties: {},
        trade: { deliveryTerm: "FCA" },
        transport: {},
        packageInfo: {},
        goodsLines: [{
          lineNo: 1,
          hsCode: "853620900019",
          productCode: "HTTP.TEST.1",
          description: "HTTP TEST PRODUCT",
          quantity: 1,
          unit: "Adet",
          unitPrice: 10,
          lineTotal: 10,
        }],
      },
    });

    const notReady = await fetch(
      `${API_BASE}/api/declarations/${notReadyFixtureId.toString()}/exports/ubl-ihracat`,
      {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ uuid: "22222222-2222-4222-8222-222222222222" }),
      }
    );
    const notReadyBody = await responseBody(notReady) as any;
    assert.equal(notReady.status, 409, `Eksik contract 409 dönmeli: ${JSON.stringify(notReadyBody)}`);
    assert.equal(notReadyBody?.ok, false);
    assert.equal(notReadyBody?.code, "EXPORT_NOT_READY");
    assert.ok(Array.isArray(notReadyBody?.issues) && notReadyBody.issues.length > 0);

    const wrongDeclarationId = new mongoose.Types.ObjectId().toString();
    const missing = await fetch(
      `${API_BASE}/api/declarations/${wrongDeclarationId}/exports/ubl-ihracat`,
      {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ uuid: "33333333-3333-4333-8333-333333333333" }),
      }
    );
    assert.equal(missing.status, 404, "Başka/olmayan declaration UBL olarak export edilememeli.");

    console.log(JSON.stringify({
      event: "ubl-ihracat.export-api.integration.passed",
      authenticated: true,
      unauthenticatedRejected: true,
      explicitUuidRequired: true,
      invalidUuidFailClosed: true,
      results,
      copiedSignatureMaterial: false,
      failClosedHttp409: true,
      declarationBoundaryProtected: true,
    }, null, 2));
  } finally {
    if (notReadyFixtureId) {
      await DeclarationModel.deleteOne({ _id: notReadyFixtureId });
    }
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
