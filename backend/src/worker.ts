import { Worker } from "bullmq";
import { connectDb } from "./config/db.js";
import { env } from "./config/env.js";
import { IDP_QUEUE_NAME, type IdpJobData } from "./modules/idp/queue/idpQueue.js";
import { processIdpJob } from "./modules/idp/worker/processIdpJob.js";

async function main(): Promise<void> {
  await connectDb();
  const worker = new Worker<IdpJobData>(IDP_QUEUE_NAME, async (job) => {
    await processIdpJob(job.data.processingRunId);
  }, {
    connection: { url: env.redisUrl },
    concurrency: env.idpWorkerConcurrency
  });

  worker.on("completed", (job) => console.log(JSON.stringify({ event: "idp.completed", jobId: job.id })));
  worker.on("failed", (job, error) => console.error(JSON.stringify({ event: "idp.failed", jobId: job?.id, error: error.message })));

  const shutdown = async () => {
    await worker.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  console.log(JSON.stringify({ event: "idp.worker.started", concurrency: env.idpWorkerConcurrency }));
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
