import { env } from "../../../config/env.js";
import type { ProductionReadinessConfig } from "./productionReadiness.types.js";

export function productionReadinessConfigFromEnv(): ProductionReadinessConfig {
  return {
    nodeEnv: env.nodeEnv,
    authJwtSecret: env.authJwtSecret,
    mongoUri: env.mongoUri,
    redisUrl: env.redisUrl,
    uploadDir: env.uploadDir,
    invoiceParserEnabled: env.invoiceParserEnabled,
    invoiceParserPython: env.invoiceParserPython,
    invoiceParserDir: env.invoiceParserDir,
    llmEnabled: env.llmEnabled,
    llmBaseUrl: env.llmBaseUrl,
    llmModel: env.llmModel,
  };
}
