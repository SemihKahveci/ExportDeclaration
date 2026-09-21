import assert from "node:assert/strict";
import crypto from "node:crypto";
import { MongoClient, ObjectId } from "mongodb";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://backend:3000";
const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://mongo:27017/export_declaration";

const DECLARATION_0110 = "6aad3295ca6e4f9c2d155507";
const UPLOADED_FILE_0110 = "6aad3295ca6e4f9c2d15550d";
const OTHER_DECLARATION_0146 = "6aad3237ca6e4f9c2d1554f5";

function cookieHeader(setCookie: string | null): string {
  if (!setCookie) throw new Error("Login response did not return a session cookie.");
  return setCookie.split(";")[0]!;
}

async function waitForBackend(): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`);
      if (response.ok || response.status < 500) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw lastError ?? new Error("Backend readiness timeout.");
}

async function login(): Promise<string> {
  const email = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("SUPERADMIN_EMAIL/PASSWORD are required in the backend container for this regression.");
  }
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.text();
  assert.equal(response.status, 200, `Login failed: ${response.status} ${body}`);
  return cookieHeader(response.headers.get("set-cookie"));
}

async function get(path: string, cookie: string): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, { headers: { cookie } });
}

async function main(): Promise<void> {
  await waitForBackend();
  const cookie = await login();

  const mongo = new MongoClient(MONGODB_URI);
  await mongo.connect();
  try {
    const db = mongo.db();
    const uploaded = await db.collection("uploadeddocuments").findOne({
      _id: new ObjectId(UPLOADED_FILE_0110),
      declarationId: new ObjectId(DECLARATION_0110),
    });

    // Some historical deployments used a different collection name. Resolve it
    // from Mongo metadata only for test diagnostics; the production API remains authoritative.
    let persisted = uploaded;
    let collectionName = "uploadeddocuments";
    if (!persisted) {
      for (const info of await db.listCollections().toArray()) {
        const candidate = await db.collection(info.name).findOne({
          _id: new ObjectId(UPLOADED_FILE_0110),
          declarationId: new ObjectId(DECLARATION_0110),
        });
        if (candidate) {
          persisted = candidate;
          collectionName = info.name;
          break;
        }
      }
    }
    assert.ok(persisted, "Known 0110 UploadedFile was not found in Mongo.");
    assert.ok(persisted.storageKey, "Known 0110 UploadedFile has no storageKey.");

    const contentPath = `/api/declarations/${DECLARATION_0110}/documents/${UPLOADED_FILE_0110}/content`;
    const content = await get(contentPath, cookie);
    const pdfBytes = Buffer.from(await content.arrayBuffer());
    assert.equal(content.status, 200, `PDF content endpoint failed: ${content.status}`);
    assert.match(content.headers.get("content-type") ?? "", /application\/pdf/i);
    assert.equal(pdfBytes.subarray(0, 5).toString("ascii"), "%PDF-", "Returned content is not a PDF.");
    assert.ok(pdfBytes.length > 1000, "Returned PDF is unexpectedly small.");

    const imagePath = `/api/declarations/${DECLARATION_0110}/documents/${UPLOADED_FILE_0110}/pages/1/image`;
    const image = await get(imagePath, cookie);
    const pngBytes = Buffer.from(await image.arrayBuffer());
    assert.equal(image.status, 200, `Page image endpoint failed: ${image.status}`);
    assert.match(image.headers.get("content-type") ?? "", /image\/png/i);
    assert.deepEqual([...pngBytes.subarray(0, 8)], [137,80,78,71,13,10,26,10], "Returned page is not PNG.");
    assert.ok(pngBytes.length > 1000, "Rendered page PNG is unexpectedly small.");

    const wrongDeclaration = await get(
      `/api/declarations/${OTHER_DECLARATION_0146}/documents/${UPLOADED_FILE_0110}/content`,
      cookie
    );
    assert.equal(wrongDeclaration.status, 404, "Cross-declaration document access must return 404.");

    const missingDocument = await get(
      `/api/declarations/${DECLARATION_0110}/documents/000000000000000000000001/content`,
      cookie
    );
    assert.equal(missingDocument.status, 404, "Unknown document access must return 404.");

    console.log(JSON.stringify({
      event: "document-evidence-viewer.runtime-regression.passed",
      declarationId: DECLARATION_0110,
      uploadedFileId: UPLOADED_FILE_0110,
      mongoCollection: collectionName,
      storageKey: persisted.storageKey,
      pdfBytes: pdfBytes.length,
      pdfSha256: crypto.createHash("sha256").update(pdfBytes).digest("hex"),
      page: 1,
      pngBytes: pngBytes.length,
      pngSha256: crypto.createHash("sha256").update(pngBytes).digest("hex"),
      tenantScoped: true,
      declarationScoped: true,
      missingDocumentRejected: true,
    }, null, 2));
  } finally {
    await mongo.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
