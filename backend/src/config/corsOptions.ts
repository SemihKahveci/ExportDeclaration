import type { CorsOptions } from "cors";
import { env } from "./env.js";

const methods = ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS", "HEAD"] as const;
const allowedHeaders = ["Content-Type"];

export function buildCorsOptions(): CorsOptions {
  const allowedOrigins = env.corsAllowedOrigins;
  return {
    origin(origin, callback) {
      // Tarayıcı dışı isteklerde Origin yoktur.
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.length === 0) {
        callback(null, false);
        return;
      }
      callback(null, allowedOrigins.includes(origin));
    },
    methods: [...methods],
    allowedHeaders: [...allowedHeaders],
    credentials: true
  };
}