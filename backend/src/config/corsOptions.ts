import type { CorsOptions } from "cors";
import { env } from "./env.js";

const methods = ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS", "HEAD"] as const;
const allowedHeaders = ["Content-Type", "x-company-id", "x-user-id"];

export function buildCorsOptions(): CorsOptions {
  const allowedOrigins = env.corsAllowedOrigins;
  return {
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    methods: [...methods],
    allowedHeaders: [...allowedHeaders]
  };
}
