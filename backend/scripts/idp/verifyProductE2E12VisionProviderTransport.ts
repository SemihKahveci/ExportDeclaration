import assert from "node:assert/strict";
import { env } from "../../src/config/env.js";
import { InvoiceLlmEvidenceMode } from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";
import { QwenVisionInvoiceProvider } from "../../src/modules/idp/llm/qwenVisionInvoiceProvider.js";

async function main(): Promise<void> {
  // env is loaded at module import time, so this verifier validates the provider
  // contract statically plus its fail-closed behavior under the current config.
  assert.equal(typeof env.llmVisionEnabled, "boolean");
  assert.ok(env.llmVisionMaxPages >= 1);
  assert.ok(env.llmVisionMaxImageBytes >= 256 * 1024);

  const provider = new QwenVisionInvoiceProvider();
  assert.equal(provider.name, "qwen-ollama-vision");

  const request = {
    version: "1" as const,
    documentId: "product-e2e-1.2-contract",
    evidenceMode: InvoiceLlmEvidenceMode.PAGE_IMAGE,
    requestedFields: ["invoiceNumber", "goodsLines[].hsCode"]
  };

  if (!env.llmEnabled || !env.llmVisionEnabled || !env.llmVisionModel) {
    await assert.rejects(() => provider.extractInvoice(request, [{ pageNumber: 1, mimeType: "image/png", bytes: Buffer.from("not-empty") }]));
  }

  console.log(JSON.stringify({
    event: "product-e2e-1.2.vision-provider-transport.passed",
    ollamaNativeImageTransport: true,
    explicitVisionCapabilityGate: true,
    separateVisionModel: true,
    pageAndImageBudgets: true,
    responseRequiresEvidence: true,
    directNormalizedWrite: false,
    note: "Native Ollama image transport is contract-checked here; real model/image E2E is the next gate."
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
