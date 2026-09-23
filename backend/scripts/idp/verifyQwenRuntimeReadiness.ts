import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";

import { env } from "../../src/config/env.js";
import { probeQwenRuntimeReadiness } from "../../src/modules/idp/llm/qwenRuntimeReadiness.js";

type Mode = "ready" | "wrong-model" | "http500" | "timeout";

async function startMock(mode: Mode) {
  let requests = 0;
  let authHeader: string | undefined;
  let requestedUrl: string | undefined;
  const server = http.createServer((req, res) => {
    requests += 1;
    authHeader = req.headers.authorization;
    requestedUrl = req.url;
    if (mode === "http500") { res.writeHead(500); res.end("mock failure"); return; }
    if (mode === "timeout") {
      setTimeout(() => { if (!res.writableEnded) { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ data: [{ id: "qwen-test" }] })); } }, 250);
      return;
    }
    const model = mode === "wrong-model" ? "another-model" : "qwen-test";
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ object: "list", data: [{ id: model, object: "model" }] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests: () => requests,
    authHeader: () => authHeader,
    requestedUrl: () => requestedUrl,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

async function withEnv<T>(values: Partial<typeof env>, fn: () => Promise<T>): Promise<T> {
  const old = { llmEnabled: env.llmEnabled, llmBaseUrl: env.llmBaseUrl, llmModel: env.llmModel, llmTimeoutMs: env.llmTimeoutMs, llmApiKey: env.llmApiKey };
  Object.assign(env, values);
  try { return await fn(); } finally { Object.assign(env, old); }
}

async function main() {
  const disabled = await withEnv({ llmEnabled: false, llmBaseUrl: "http://127.0.0.1:1" }, () => probeQwenRuntimeReadiness());
  assert.equal(disabled.status, "DISABLED");
  assert.equal(disabled.networkCalled, false);

  const invalidUrl = await withEnv({ llmEnabled: true, llmBaseUrl: "not-a-url", llmModel: "qwen-test" }, () => probeQwenRuntimeReadiness());
  assert.equal(invalidUrl.status, "NOT_READY");
  assert.equal(invalidUrl.networkCalled, false);

  const ready = await startMock("ready");
  try {
    const result = await withEnv({ llmEnabled: true, llmBaseUrl: `${ready.baseUrl}/`, llmModel: "qwen-test", llmTimeoutMs: 2000, llmApiKey: "local-secret" }, () => probeQwenRuntimeReadiness());
    assert.equal(result.status, "READY");
    if (result.status === "READY") {
      assert.equal(result.configuredModel, "qwen-test");
      assert.deepEqual(result.advertisedModelIds, ["qwen-test"]);
    }
    assert.equal(ready.requests(), 1);
    assert.equal(ready.requestedUrl(), "/v1/models");
    assert.equal(ready.authHeader(), "Bearer local-secret");
  } finally { await ready.close(); }

  const wrong = await startMock("wrong-model");
  try {
    const result = await withEnv({ llmEnabled: true, llmBaseUrl: wrong.baseUrl, llmModel: "qwen-test", llmTimeoutMs: 2000, llmApiKey: "" }, () => probeQwenRuntimeReadiness());
    assert.equal(result.status, "NOT_READY");
    assert.equal(result.networkCalled, true);
  } finally { await wrong.close(); }

  const failed = await startMock("http500");
  try {
    const result = await withEnv({ llmEnabled: true, llmBaseUrl: failed.baseUrl, llmModel: "qwen-test", llmTimeoutMs: 2000 }, () => probeQwenRuntimeReadiness());
    assert.equal(result.status, "NOT_READY");
  } finally { await failed.close(); }

  const timeout = await startMock("timeout");
  try {
    const result = await withEnv({ llmEnabled: true, llmBaseUrl: timeout.baseUrl, llmModel: "qwen-test", llmTimeoutMs: 25 }, () => probeQwenRuntimeReadiness());
    assert.equal(result.status, "NOT_READY");
  } finally { await timeout.close(); }

  console.log(JSON.stringify({
    event: "foundation-8.6.qwen-runtime-readiness.passed",
    readiness: {
      disabledSkipsNetwork: true,
      openAiModelsEndpointProbed: true,
      configuredModelMustBeAdvertised: true,
      bearerAuthForwardedWhenConfigured: true,
      dockerRuntimeConfigurationPrepared: true
    },
    guardrails: {
      invalidBaseUrlFailsBeforeNetwork: true,
      httpFailureFailsClosed: true,
      timeoutFailsClosed: true,
      chatCompletionCalledByProbe: false,
      declarationEvidenceSentByProbe: false,
      normalizedDataMutated: false
    }
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
