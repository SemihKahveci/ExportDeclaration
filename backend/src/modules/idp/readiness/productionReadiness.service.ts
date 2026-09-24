import type {
  ProductionReadinessAssessment,
  ProductionReadinessCheck,
  ProductionReadinessConfig,
} from "./productionReadiness.types.js";

const DEV_SECRET = "dev-only-change-this-auth-secret-at-least-32-chars";

function configuredUri(value: string): boolean {
  try {
    const parsed = new URL(value);
    return Boolean(parsed.protocol && parsed.hostname);
  } catch {
    return false;
  }
}

function check(
  name: ProductionReadinessCheck["name"],
  required: boolean,
  ready: boolean,
  reason: string,
): ProductionReadinessCheck {
  return ready
    ? { name, required, status: "READY" }
    : { name, required, status: "NOT_READY", reason };
}

export function assessProductionReadinessConfiguration(
  config: ProductionReadinessConfig,
): ProductionReadinessAssessment {
  const productionMode = config.nodeEnv.trim().toLowerCase() === "production";
  const checks: ProductionReadinessCheck[] = [];

  checks.push(check(
    "PRODUCTION_AUTH_SECRET",
    productionMode,
    !productionMode || (
      config.authJwtSecret.trim().length >= 32
      && config.authJwtSecret !== DEV_SECRET
    ),
    "Production requires a non-default AUTH_JWT_SECRET with at least 32 characters.",
  ));

  checks.push(check(
    "MONGODB_CONFIGURATION",
    true,
    configuredUri(config.mongoUri) && /^mongodb(\+srv)?:\/\//i.test(config.mongoUri),
    "MONGODB_URI must be an explicit mongodb:// or mongodb+srv:// URI.",
  ));

  checks.push(check(
    "REDIS_CONFIGURATION",
    true,
    configuredUri(config.redisUrl) && /^rediss?:\/\//i.test(config.redisUrl),
    "REDIS_URL must be an explicit redis:// or rediss:// URI.",
  ));

  checks.push(check(
    "UPLOAD_STORAGE",
    true,
    config.uploadDir.trim().length > 0,
    "UPLOAD_DIR must be configured.",
  ));

  if (!config.invoiceParserEnabled) {
    checks.push({
      name: "OCR_CONFIGURATION",
      required: false,
      status: "DISABLED",
      reason: "INVOICE_PARSER_ENABLED is false; OCR/parser runtime is explicitly disabled.",
    });
  } else {
    checks.push(check(
      "OCR_CONFIGURATION",
      true,
      config.invoiceParserPython.trim().length > 0 && config.invoiceParserDir.trim().length > 0,
      "Enabled invoice parser requires INVOICE_PARSER_PYTHON and INVOICE_PARSER_DIR.",
    ));
  }

  if (!config.llmEnabled) {
    checks.push({
      name: "LLM_CONFIGURATION",
      required: false,
      status: "DISABLED",
      reason: "LLM assistance is explicitly disabled.",
    });
  } else {
    checks.push(check(
      "LLM_CONFIGURATION",
      true,
      configuredUri(config.llmBaseUrl) && config.llmModel.trim().length > 0,
      "LLM_ENABLED=true requires a valid LLM_BASE_URL and non-empty LLM_MODEL.",
    ));
  }

  const status = checks.some((item) => item.required && item.status === "NOT_READY")
    ? "NOT_READY"
    : "READY";

  return { version: "1", productionMode, status, checks };
}

export function assertProductionReadinessConfiguration(
  config: ProductionReadinessConfig,
): ProductionReadinessAssessment {
  const assessment = assessProductionReadinessConfiguration(config);
  if (assessment.status === "NOT_READY") {
    const reasons = assessment.checks
      .filter((item) => item.required && item.status === "NOT_READY")
      .map((item) => `${item.name}: ${item.reason ?? "not ready"}`)
      .join("; ");
    throw new Error(`Production readiness configuration failed: ${reasons}`);
  }
  return assessment;
}
