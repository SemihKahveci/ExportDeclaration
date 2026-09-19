import assert from "node:assert/strict";
import mongoose from "mongoose";
import * as XLSX from "xlsx";
import { env } from "../../src/config/env.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { EVRIM_EXCEL_HEADERS } from "../../src/modules/evrim-excel/evrimExcelAdapter.types.js";

const API_BASE = process.env.EVRIM_EXPORT_TEST_API_BASE ?? "http://localhost:3000";
const email = process.env.SUPERADMIN_EMAIL;
const password = process.env.SUPERADMIN_PASSWORD;

const fixtures = [
  { declarationId: "6aad3237ca6e4f9c2d1554f5", expectedLines: 56 },
  { declarationId: "6aad3295ca6e4f9c2d155507", expectedLines: 41 }
] as const;

if (!email || !password) {
  throw new Error("SUPERADMIN_EMAIL ve SUPERADMIN_PASSWORD integration testi için gerekli.");
}

async function responseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try { return JSON.parse(text); } catch { return text; }
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
      `${API_BASE}/api/declarations/${fixtures[0].declarationId}/exports/evrim-excel`,
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }
    );
    assert.equal(unauthenticated.status, 401, "Export endpoint oturumsuz erişime kapalı olmalı.");

    const login = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const loginBody = await responseBody(login);
    assert.equal(login.status, 200, `Login failed: ${JSON.stringify(loginBody)}`);
    const setCookie = login.headers.get("set-cookie");
    assert.ok(setCookie, "Login response Set-Cookie içermiyor.");
    const cookie = setCookie.split(";", 1)[0]!;

    const results: Array<Record<string, unknown>> = [];

    for (const fixture of fixtures) {
      const response = await fetch(
        `${API_BASE}/api/declarations/${fixture.declarationId}/exports/evrim-excel`,
        {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: "{}"
        }
      );

      if (response.status !== 200) {
        const errorBody = await responseBody(response);
        assert.fail(`Export failed for ${fixture.declarationId}: status=${response.status} body=${JSON.stringify(errorBody)}`);
      }
      assert.equal(
        response.headers.get("content-type"),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      assert.match(response.headers.get("content-disposition") ?? "", /^attachment; filename=".+-evrim\.xlsx"$/);
      assert.equal(response.headers.get("x-export-row-count"), String(fixture.expectedLines));

      const buffer = Buffer.from(await response.arrayBuffer());
      assert.ok(buffer.length > 4, "XLSX response boş olmamalı.");
      assert.equal(buffer.subarray(0, 2).toString("ascii"), "PK", "XLSX ZIP signature eksik.");

      const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
      assert.deepEqual(workbook.SheetNames, ["Sayfa1", "Sayfa2"]);
      const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Sayfa1, { header: 1, defval: "" });
      assert.deepEqual(rows[0], Array.from(EVRIM_EXCEL_HEADERS));
      assert.equal(rows.length - 1, fixture.expectedLines);
      assert.equal(rows[1]?.[8], "BI");

      results.push({
        declarationId: fixture.declarationId,
        status: response.status,
        rowCount: fixture.expectedLines,
        packageType: rows[1]?.[8],
        sheets: workbook.SheetNames,
        contentType: response.headers.get("content-type"),
        contentDisposition: response.headers.get("content-disposition")
      });
    }

    notReadyFixtureId = new mongoose.Types.ObjectId();
    await DeclarationModel.create({
      _id: notReadyFixtureId,
      companyId,
      normalizedData: {
        header: { invoiceNo: "HTTP-NOT-READY", invoiceDate: new Date("2026-09-19T00:00:00Z"), currency: "EUR" },
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
          lineTotal: 10
        }]
      }
    });

    const notReady = await fetch(
      `${API_BASE}/api/declarations/${notReadyFixtureId.toString()}/exports/evrim-excel`,
      { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{}" }
    );
    const notReadyBody = await responseBody(notReady) as any;
    assert.equal(notReady.status, 409, `Eksik contract 409 dönmeli: ${JSON.stringify(notReadyBody)}`);
    assert.equal(notReadyBody?.ok, false);
    assert.equal(notReadyBody?.code, "EXPORT_NOT_READY");
    assert.ok(Array.isArray(notReadyBody?.issues) && notReadyBody.issues.length > 0);

    const wrongDeclarationId = new mongoose.Types.ObjectId().toString();
    const missing = await fetch(
      `${API_BASE}/api/declarations/${wrongDeclarationId}/exports/evrim-excel`,
      { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{}" }
    );
    assert.equal(missing.status, 404, "Başka/olmayan declaration export edilememeli.");

    console.log(JSON.stringify({
      event: "evrim.excel-export-api.integration.passed",
      authenticated: true,
      unauthenticatedRejected: true,
      results,
      failClosedHttp409: true,
      declarationBoundaryProtected: true
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
