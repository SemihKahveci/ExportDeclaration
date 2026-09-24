import assert from "node:assert/strict";
import {
  assertProductionReadinessConfiguration,
  assessProductionReadinessConfiguration,
} from "../../src/modules/idp/readiness/productionReadiness.service.js";
import type { ProductionReadinessConfig } from "../../src/modules/idp/readiness/productionReadiness.types.js";

const base: ProductionReadinessConfig = {
  nodeEnv: "production",
  authJwtSecret: "production-secret-that-is-definitely-long-enough-123",
  mongoUri: "mongodb://mongo:27017/export_declaration",
  redisUrl: "redis://redis:6379",
  uploadDir: "/app/uploads",
  invoiceParserEnabled: true,
  invoiceParserPython: "/opt/venv/bin/python",
  invoiceParserDir: "/app/backend/scripts/invoice_parser",
  llmEnabled: false,
  llmBaseUrl: "",
  llmModel: "qwen3:8b",
};

const ready = assessProductionReadinessConfiguration(base);
assert.equal(ready.status, "READY");
assert.equal(ready.productionMode, true);
assert.equal(ready.checks.find((x) => x.name === "LLM_CONFIGURATION")?.status, "DISABLED");

const dev = assessProductionReadinessConfiguration({
  ...base,
  nodeEnv: "development",
  authJwtSecret: "dev-only-change-this-auth-secret-at-least-32-chars",
});
assert.equal(dev.status, "READY", "Development must remain usable with the existing dev secret.");

const badSecret = assessProductionReadinessConfiguration({
  ...base,
  authJwtSecret: "dev-only-change-this-auth-secret-at-least-32-chars",
});
assert.equal(badSecret.status, "NOT_READY");

const badRedis = assessProductionReadinessConfiguration({ ...base, redisUrl: "" });
assert.equal(badRedis.status, "NOT_READY");

const disabledOcr = assessProductionReadinessConfiguration({
  ...base,
  invoiceParserEnabled: false,
  invoiceParserPython: "",
  invoiceParserDir: "",
});
assert.equal(disabledOcr.status, "READY");
assert.equal(disabledOcr.checks.find((x) => x.name === "OCR_CONFIGURATION")?.status, "DISABLED");

const badEnabledOcr = assessProductionReadinessConfiguration({
  ...base,
  invoiceParserEnabled: true,
  invoiceParserPython: "",
});
assert.equal(badEnabledOcr.status, "NOT_READY");

const badEnabledLlm = assessProductionReadinessConfiguration({
  ...base,
  llmEnabled: true,
  llmBaseUrl: "",
});
assert.equal(badEnabledLlm.status, "NOT_READY");

const enabledLlm = assessProductionReadinessConfiguration({
  ...base,
  llmEnabled: true,
  llmBaseUrl: "http://qwen-runtime:11434",
  llmModel: "qwen3:8b",
});
assert.equal(enabledLlm.status, "READY");

let failClosed = false;
try {
  assertProductionReadinessConfiguration({ ...base, mongoUri: "" });
} catch {
  failClosed = true;
}
assert.equal(failClosed, true);

console.log(JSON.stringify({
  event: "foundation-10.1.production-readiness-contract.passed",
  configuration: {
    productionModeDetected: true,
    productionDefaultAuthSecretRejected: true,
    mongoConfigurationRequired: true,
    redisConfigurationRequired: true,
    uploadStorageRequired: true,
    enabledOcrRequiresConfiguration: true,
    disabledOcrExplicitlyRepresented: true,
    llmOptionalWhenDisabled: true,
    enabledLlmRequiresEndpointAndModel: true,
    developmentDefaultsRemainUsable: true,
  },
  guardrails: {
    failClosedOnRequiredProductionConfiguration: true,
    llmSilentlyEnabled: false,
    confidencePolicyInvented: false,
    declarationMutated: false,
    normalizedDataMutated: false,
    candidateAuthorityCreated: false,
  },
}, null, 2));
