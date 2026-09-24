import { bootstrapSuperAdmin } from "./modules/auth/bootstrapSuperAdmin.js";
import fs from "node:fs/promises";
import app from "./app.js";
import { connectDb } from "./config/db.js";
import { env } from "./config/env.js";
import { assertProductionReadinessConfiguration } from "./modules/idp/readiness/productionReadiness.service.js";
import { productionReadinessConfigFromEnv } from "./modules/idp/readiness/productionReadiness.env.js";

async function main(): Promise<void> {
  const readiness = assertProductionReadinessConfiguration(productionReadinessConfigFromEnv());
  console.log(JSON.stringify({ event: "production.readiness.configuration", status: readiness.status, productionMode: readiness.productionMode }));

  if (env.authJwtSecret.trim().length < 32) {
    throw new Error("AUTH_JWT_SECRET en az 32 karakter olmalıdır.");
  }
  await fs.mkdir(env.uploadDir, { recursive: true });
  await connectDb();
  await bootstrapSuperAdmin();

  const server = app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`API http://localhost:${env.port}`);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      // eslint-disable-next-line no-console
      console.error(
        `Port ${env.port} zaten kullanımda (EADDRINUSE).\n` +
          `- Çalışan eski sunucuyu durdurun, veya\n` +
          `- .env içinde PORT=3001 gibi başka bir port verin.\n` +
          `Windows: netstat -ano | findstr :${env.port}  sonra taskkill /PID <pid> /F`
      );
      process.exit(1);
      return;
    }
    throw err;
  });
}

void main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});