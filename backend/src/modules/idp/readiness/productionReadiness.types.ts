export type ProductionReadinessCheckName =
  | "PRODUCTION_AUTH_SECRET"
  | "MONGODB_CONFIGURATION"
  | "REDIS_CONFIGURATION"
  | "UPLOAD_STORAGE"
  | "OCR_CONFIGURATION"
  | "LLM_CONFIGURATION";

export type ProductionReadinessCheckStatus = "READY" | "NOT_READY" | "DISABLED";

export interface ProductionReadinessCheck {
  name: ProductionReadinessCheckName;
  status: ProductionReadinessCheckStatus;
  required: boolean;
  reason?: string;
}

export interface ProductionReadinessConfig {
  nodeEnv: string;
  authJwtSecret: string;
  mongoUri: string;
  redisUrl: string;
  uploadDir: string;
  invoiceParserEnabled: boolean;
  invoiceParserPython: string;
  invoiceParserDir: string;
  llmEnabled: boolean;
  llmBaseUrl: string;
  llmModel: string;
}

export interface ProductionReadinessAssessment {
  version: "1";
  productionMode: boolean;
  status: "READY" | "NOT_READY";
  checks: ProductionReadinessCheck[];
}
