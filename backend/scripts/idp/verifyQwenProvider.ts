import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";

import { env } from "../../src/config/env.js";
import {
  LlmResolveDecision,
  type LlmResolveRequest
} from "../../src/modules/idp/domain/llmResolve.types.js";
import {
  CandidateExtractionStatus,
  type CandidateExtractionEnvelope
} from "../../src/modules/idp/domain/candidateExtraction.types.js";
import { ClassifiedDocumentType } from "../../src/modules/idp/domain/segmentClassification.types.js";
import { QwenOpenAiProvider } from "../../src/modules/idp/llm/qwenOpenAiProvider.js";

type MockMode = "valid" | "malformed-json" | "http-500" | "timeout";

function envelope(): CandidateExtractionEnvelope {
  return {
    version: "1",
    segments: [1, 2].map((i) => ({
      segmentId: `segment-00${i}`,
      documentType: ClassifiedDocumentType.INVOICE,
      status: CandidateExtractionStatus.EXTRACTED,
      pageNumbers: [i],
      data: { invoiceNo: `INV-${i}` }
    }))
  };
}

const request: LlmResolveRequest = {
  version: "1",
  task: "RESOLVE_INVOICE_CANDIDATES",
  candidates: envelope()
};

async function startMockServer(mode: MockMode) {
  let requestCount = 0;

  const server = http.createServer((_req, res) => {
    requestCount += 1;

    if (mode === "http-500") {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "mock failure" } }));
      return;
    }

    if (mode === "timeout") {
      setTimeout(() => {
        if (!res.writableEnded) {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ choices: [] }));
        }
      }, 500);
      return;
    }

    const content =
      mode === "malformed-json"
        ? "this is not structured JSON"
        : JSON.stringify({
            version: "1",
            decision: LlmResolveDecision.RESOLVED,
            sourceSegmentIds: ["segment-002"],
            data: { invoiceNo: "INV-2" },
            issues: []
          });

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      choices: [{ message: { content } }]
    }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests: () => requestCount,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
  };
}

async function expectFailure(name: string, fn: () => Promise<unknown>) {
  let failed = false;
  try {
    await fn();
  } catch {
    failed = true;
  }
  assert.equal(failed, true, `${name}: provider must fail closed`);
}

async function withEnv<T>(
  values: Partial<Pick<typeof env, "llmEnabled" | "llmBaseUrl" | "llmModel" | "llmTimeoutMs" | "llmApiKey">>,
  fn: () => Promise<T>
): Promise<T> {
  const previous = {
    llmEnabled: env.llmEnabled,
    llmBaseUrl: env.llmBaseUrl,
    llmModel: env.llmModel,
    llmTimeoutMs: env.llmTimeoutMs,
    llmApiKey: env.llmApiKey
  };

  Object.assign(env, values);
  try {
    return await fn();
  } finally {
    Object.assign(env, previous);
  }
}

async function main() {
  const provider = new QwenOpenAiProvider();
  const cases: Array<Record<string, unknown>> = [];

  // Disabled must fail before any network access.
  await withEnv(
    {
      llmEnabled: false,
      llmBaseUrl: "http://127.0.0.1:1",
      llmModel: "qwen-test",
      llmTimeoutMs: 100
    },
    async () => {
      await expectFailure("disabled", () => provider.resolveCandidates(request));
      cases.push({ name: "disabled", status: "REJECTED_BEFORE_HTTP" });
    }
  );

  {
    const mock = await startMockServer("valid");
    try {
      await withEnv(
        { llmEnabled: true, llmBaseUrl: mock.baseUrl, llmModel: "qwen-test", llmTimeoutMs: 2000, llmApiKey: "" },
        async () => {
          const result = await provider.resolveCandidates(request);
          assert.equal(result.decision, LlmResolveDecision.RESOLVED);
          assert.deepEqual(result.sourceSegmentIds, ["segment-002"]);
          assert.deepEqual(result.data, { invoiceNo: "INV-2" });
          assert.equal(result.model, "qwen-test");
          assert.equal(result.provider, "qwen-openai-compatible");
        }
      );
      assert.equal(mock.requests(), 1);
      cases.push({ name: "valid-response", status: "PASSED" });
    } finally {
      await mock.close();
    }
  }

  {
    const mock = await startMockServer("malformed-json");
    try {
      await withEnv(
        { llmEnabled: true, llmBaseUrl: mock.baseUrl, llmModel: "qwen-test", llmTimeoutMs: 2000, llmApiKey: "" },
        async () => expectFailure("malformed-json", () => provider.resolveCandidates(request))
      );
      assert.equal(mock.requests(), 1);
      cases.push({ name: "malformed-json", status: "REJECTED" });
    } finally {
      await mock.close();
    }
  }

  {
    const mock = await startMockServer("http-500");
    try {
      await withEnv(
        { llmEnabled: true, llmBaseUrl: mock.baseUrl, llmModel: "qwen-test", llmTimeoutMs: 2000, llmApiKey: "" },
        async () => expectFailure("http-500", () => provider.resolveCandidates(request))
      );
      assert.equal(mock.requests(), 1);
      cases.push({ name: "http-500", status: "REJECTED" });
    } finally {
      await mock.close();
    }
  }

  {
    const mock = await startMockServer("timeout");
    try {
      await withEnv(
        { llmEnabled: true, llmBaseUrl: mock.baseUrl, llmModel: "qwen-test", llmTimeoutMs: 50, llmApiKey: "" },
        async () => expectFailure("timeout", () => provider.resolveCandidates(request))
      );
      assert.equal(mock.requests(), 1);
      cases.push({ name: "timeout", status: "REJECTED" });
    } finally {
      await mock.close();
    }
  }

  console.log(JSON.stringify({
    event: "idp.qwen-provider.regression.passed",
    cases
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    event: "idp.qwen-provider.regression.failed",
    error: error instanceof Error ? error.message : String(error)
  }, null, 2));
  process.exit(1);
});
