import assert from "node:assert/strict";
import {
  WRITING_READY_LIMIT_MS,
  hasStartedWriting,
  readyAtFromHistory,
  writingReadyReminderDue
} from "../../src/modules/mail/writingReadyReminder.service.js";
import type { OpenMailFile } from "../../src/modules/mail/openMailFiles.js";

assert.equal(WRITING_READY_LIMIT_MS, 15 * 60 * 1000);

const readyAt = new Date("2026-11-23T10:00:00.000Z");
assert.equal(writingReadyReminderDue({
  readyAt,
  now: new Date("2026-11-23T10:14:59.000Z"),
  startedWriting: false
}), false);
assert.equal(writingReadyReminderDue({
  readyAt,
  now: new Date("2026-11-23T10:15:00.000Z"),
  startedWriting: false
}), true);
assert.equal(writingReadyReminderDue({
  readyAt,
  now: new Date("2026-11-23T11:00:00.000Z"),
  startedWriting: true
}), false);
assert.equal(writingReadyReminderDue({
  readyAt: null,
  now: new Date("2026-11-23T11:00:00.000Z"),
  startedWriting: false
}), false);

const idleFile: OpenMailFile = {
  _id: "000000000000000000000001" as unknown as OpenMailFile["_id"],
  companyId: "000000000000000000000002" as unknown as OpenMailFile["companyId"],
  operation: {
    fileStatus: "beyanname-yazim",
    workflowHistory: [
      { action: "AUTO_ADVANCE", toStatus: "beyanname-yazim", at: readyAt }
    ]
  }
};
assert.equal(hasStartedWriting(idleFile), false);
assert.equal(readyAtFromHistory(idleFile)?.toISOString(), readyAt.toISOString());

const startedFile: OpenMailFile = {
  ...idleFile,
  operation: {
    ...idleFile.operation,
    workflowHistory: [
      ...(idleFile.operation?.workflowHistory ?? []),
      { action: "START_WRITING", toStatus: "beyanname-yazim", at: new Date("2026-11-23T10:10:00.000Z") }
    ]
  }
};
assert.equal(hasStartedWriting(startedFile), true);
assert.equal(writingReadyReminderDue({
  readyAt: readyAtFromHistory(startedFile),
  now: new Date("2026-11-23T10:30:00.000Z"),
  startedWriting: hasStartedWriting(startedFile)
}), false);

console.log("writing ready reminder ok");
