import assert from "node:assert/strict";
import {
  dailyReminderSlot,
  dueReminderSlot,
  everyTwoHoursSlot,
  twiceReminderSlot
} from "../../src/modules/mail/documentReminderSchedule.js";

const received = new Date("2026-10-28T08:00:00.000Z");
const none = new Set<string>();

assert.equal(everyTwoHoursSlot(received, received), null);
assert.equal(everyTwoHoursSlot(received, new Date(received.getTime() + 2 * 60 * 60 * 1000)), "2h:1");
assert.equal(dueReminderSlot({
  frequency: "Her 2 saatte bir",
  receivedAt: received,
  cutoffAt: null,
  now: new Date(received.getTime() + 2 * 60 * 60 * 1000),
  sent: new Set(["2h:0"])
}), "2h:1");
assert.equal(dueReminderSlot({
  frequency: "Her 2 saatte bir",
  receivedAt: received,
  cutoffAt: null,
  now: new Date(received.getTime() + 2 * 60 * 60 * 1000),
  sent: new Set(["2h:1"])
}), null);

assert.equal(dailyReminderSlot(new Date("2026-10-28T05:59:00.000Z")), null);
assert.equal(dailyReminderSlot(new Date("2026-10-28T06:00:00.000Z")), "1d:2026-10-28:09");
assert.equal(twiceReminderSlot(new Date("2026-10-28T06:00:00.000Z")), "2d:2026-10-28:09");
assert.equal(twiceReminderSlot(new Date("2026-10-28T12:00:00.000Z")), "2d:2026-10-28:15");

assert.equal(dueReminderSlot({
  frequency: "Cut-off'a göre dinamik",
  receivedAt: received,
  cutoffAt: null,
  now: new Date("2026-10-28T06:05:00.000Z"),
  sent: none
}), "1d:2026-10-28:09");
assert.equal(dueReminderSlot({
  frequency: "Cut-off'a göre dinamik",
  receivedAt: received,
  cutoffAt: new Date("2026-10-28T05:00:00.000Z"),
  now: new Date("2026-10-28T06:05:00.000Z"),
  sent: none
}), null);
assert.equal(dueReminderSlot({
  frequency: "Cut-off'a göre dinamik",
  receivedAt: received,
  cutoffAt: new Date("2026-10-31T12:00:00.000Z"),
  now: new Date("2026-10-28T07:00:00.000Z"),
  sent: none
}), "cut:1d:2026-10-28:09");
assert.equal(dueReminderSlot({
  frequency: "Cut-off'a göre dinamik",
  receivedAt: received,
  cutoffAt: new Date("2026-10-28T18:00:00.000Z"),
  now: new Date("2026-10-28T12:00:00.000Z"),
  sent: none
}), "cut:2d:2026-10-28:15");
assert.equal(dueReminderSlot({
  frequency: "Cut-off'a göre dinamik",
  receivedAt: received,
  cutoffAt: new Date(received.getTime() + 3 * 60 * 60 * 1000),
  now: new Date(received.getTime() + 2 * 60 * 60 * 1000),
  sent: none
}), "cut:2h:1");
assert.equal(dueReminderSlot({
  frequency: "Manuel takip",
  receivedAt: received,
  cutoffAt: null,
  now: new Date("2026-10-28T06:05:00.000Z"),
  sent: none
}), null);

console.log("document reminder schedule ok");
