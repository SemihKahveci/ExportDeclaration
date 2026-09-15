import { Queue } from "bullmq";
import { env } from "../../../config/env.js";

export const IDP_QUEUE_NAME = "idp-processing";
export type IdpJobData = { processingRunId: string };

let queue: Queue<IdpJobData> | undefined;
export function getIdpQueue(): Queue<IdpJobData> {
  queue ??= new Queue<IdpJobData>(IDP_QUEUE_NAME, {
    connection: { url: env.redisUrl },
    defaultJobOptions: {
      attempts: env.idpJobAttempts,
      backoff: { type: "exponential", delay: env.idpJobBackoffMs },
      removeOnComplete: { age: 24 * 3600, count: 5000 },
      removeOnFail: { age: 7 * 24 * 3600, count: 10000 }
    }
  });
  return queue;
}

export async function closeIdpQueue(): Promise<void> {
  if (queue) await queue.close();
  queue = undefined;
}
