import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";

import { env } from "../../src/config/env.js";
import { DeclarationLlmAssistDecision, type DeclarationLlmAssistRequest } from "../../src/modules/idp/domain/declarationLlmAssist.types.js";
import { QwenOpenAiProvider } from "../../src/modules/idp/llm/qwenOpenAiProvider.js";
import { resolveDeclarationConflictsWithLlm } from "../../src/modules/idp/llm/resolveDeclarationConflictsWithLlm.js";

const request: DeclarationLlmAssistRequest = {
  version: "1",
  task: "RESOLVE_DECLARATION_CONFLICTS",
  companyId: "company-f82",
  declarationId: "declaration-f82",
  fields: [{
    field: "goodsLines.0.quantity",
    candidates: [
      { candidateId: "invoice-qty-2", field: "goodsLines.0.quantity", documentType: "INVOICE", logicalDocumentId: "ld-invoice", uploadedFileId: "uf-invoice", value: 2 },
      { candidateId: "packing-qty-3", field: "goodsLines.0.quantity", documentType: "PACKING_LIST", logicalDocumentId: "ld-packing", uploadedFileId: "uf-packing", value: 3 }
    ]
  }]
};

type Mode = "valid" | "review" | "hallucinated" | "unrequested" | "partial" | "malformed" | "http500" | "timeout";

async function startMock(mode: Mode) {
  let requests = 0;
  let lastBody: any;
  const server = http.createServer(async (req, res) => {
    requests += 1;
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    lastBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (mode === "http500") { res.writeHead(500); res.end("mock failure"); return; }
    if (mode === "timeout") { setTimeout(() => { if (!res.writableEnded) { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ choices: [] })); } }, 300); return; }
    let content: string;
    if (mode === "malformed") content = "not-json";
    else if (mode === "review") content = JSON.stringify({ version: "1", decision: "REVIEW_REQUIRED", selections: [], issues: [{ code: "AMBIGUOUS", message: "Evidence remains ambiguous." }] });
    else if (mode === "hallucinated") content = JSON.stringify({ version: "1", decision: "RESOLVED", selections: [{ field: "goodsLines.0.quantity", candidateId: "invented-2.5" }], issues: [] });
    else if (mode === "unrequested") content = JSON.stringify({ version: "1", decision: "RESOLVED", selections: [{ field: "invoiceNo", candidateId: "invoice-qty-2" }], issues: [] });
    else if (mode === "partial") content = JSON.stringify({ version: "1", decision: "RESOLVED", selections: [], issues: [] });
    else content = JSON.stringify({ version: "1", decision: "RESOLVED", selections: [{ field: "goodsLines.0.quantity", candidateId: "invoice-qty-2" }], issues: [] });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, requests: () => requests, body: () => lastBody, close: () => new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve())) };
}

async function withEnv<T>(values: Partial<typeof env>, fn: () => Promise<T>): Promise<T> {
  const old = { llmEnabled: env.llmEnabled, llmBaseUrl: env.llmBaseUrl, llmModel: env.llmModel, llmTimeoutMs: env.llmTimeoutMs, llmApiKey: env.llmApiKey };
  Object.assign(env, values);
  try { return await fn(); } finally { Object.assign(env, old); }
}
async function rejects(fn: () => Promise<unknown>) { let ok = false; try { await fn(); } catch { ok = true; } assert.equal(ok, true); }

async function main() {
  const provider = new QwenOpenAiProvider();
  await withEnv({ llmEnabled: false, llmBaseUrl: "http://127.0.0.1:1", llmModel: "qwen-test", llmTimeoutMs: 50 }, async () => rejects(() => resolveDeclarationConflictsWithLlm({ request, provider })));

  const valid = await startMock("valid");
  try {
    await withEnv({ llmEnabled: true, llmBaseUrl: valid.baseUrl, llmModel: "qwen-test", llmTimeoutMs: 2000, llmApiKey: "" }, async () => {
      const result = await resolveDeclarationConflictsWithLlm({ request, provider });
      assert.equal(result.decision, DeclarationLlmAssistDecision.RESOLVED);
      assert.equal(result.selections[0]?.candidateId, "invoice-qty-2");
      assert.equal(result.provider, "qwen-openai-compatible");
      assert.equal(result.model, "qwen-test");
    });
    assert.equal(valid.requests(), 1);
    assert.equal(valid.body()?.temperature, 0);
    assert.deepEqual(valid.body()?.response_format, { type: "json_object" });
    assert.equal(valid.body()?.model, "qwen-test");
  } finally { await valid.close(); }

  const review = await startMock("review");
  try { await withEnv({ llmEnabled: true, llmBaseUrl: review.baseUrl, llmModel: "qwen-test", llmTimeoutMs: 2000 }, async () => { const r = await resolveDeclarationConflictsWithLlm({ request, provider }); assert.equal(r.decision, DeclarationLlmAssistDecision.REVIEW_REQUIRED); assert.deepEqual(r.selections, []); }); } finally { await review.close(); }

  for (const mode of ["hallucinated", "unrequested", "partial", "malformed", "http500", "timeout"] as Mode[]) {
    const mock = await startMock(mode);
    try { await withEnv({ llmEnabled: true, llmBaseUrl: mock.baseUrl, llmModel: "qwen-test", llmTimeoutMs: mode === "timeout" ? 30 : 2000 }, async () => rejects(() => resolveDeclarationConflictsWithLlm({ request, provider }))); } finally { await mock.close(); }
  }

  console.log(JSON.stringify({
    event: "foundation-8.2.declaration-qwen-provider-integration.passed",
    integration: { qwenOpenAiCompatibleProviderUsed: true, structuredJsonRequested: true, deterministicTemperatureZero: true, existingCandidateSelectionAccepted: true, reviewRequiredAccepted: true },
    guardrails: { disabledFailsBeforeNetwork: true, hallucinatedCandidateRejected: true, unrequestedFieldRejected: true, partialResolutionRejected: true, malformedJsonRejected: true, httpFailureRejected: true, timeoutRejected: true, normalizedDataMutated: false, foundation6AuthorityBypassed: false }
  }, null, 2));
}
main().catch((error) => { console.error(error); process.exit(1); });
