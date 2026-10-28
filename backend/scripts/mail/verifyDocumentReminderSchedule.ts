import assert from "node:assert/strict";
import { missingDocsFromRule } from "../../src/modules/declarations/declaration.service.js";
import { gtipFaultSummary } from "../../src/modules/declarations/customerGtip.service.js";
import {
  dailyReminderSlot,
  dueReminderSlot,
  everyTwoHoursSlot,
  twiceReminderSlot
} from "../../src/modules/mail/documentReminderSchedule.js";
import { renderMailVariables } from "../../src/modules/mail/processMail.service.js";

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

assert.deepEqual(missingDocsFromRule(["Fatura"], new Set(["INVOICE"])), []);
assert.deepEqual(missingDocsFromRule(["Fatura"], new Set()), ["Fatura"]);
assert.deepEqual(missingDocsFromRule(["Fatura", "ATR"], new Set(["INVOICE"])), ["ATR"]);
assert.deepEqual(missingDocsFromRule(["Fatura", "ATR"], new Set()), ["Fatura", "ATR"]);

assert.equal(gtipFaultSummary(
  [{ productCode: "M1", description: "Kumaş", hsCode: "1111" }],
  [{ materialNo: "M1", gtipNo: "2222", status: "verified" }]
), "M1 · Kumaş · 1111");
assert.equal(gtipFaultSummary(
  [{ productCode: "M1", description: "Kumaş", hsCode: "2222" }],
  [{ materialNo: "M1", gtipNo: "2222", status: "verified" }]
), "");

const values = renderMailVariables({
  customerName: "Ada",
  reference: "EX-1",
  missingDocuments: ["Fatura", "ATR"],
  tescilNo: "T-9",
  gtipResult: "M1 · Kumaş · 1111"
});
assert.equal(values["{musteri}"], "Ada");
assert.equal(values["{referans}"], "EX-1");
assert.equal(values["{eksik_evraklar}"], "Fatura, ATR");
assert.equal(values["{tescil_no}"], "T-9");
assert.equal(values["{kapanis_durumu}"], "");
assert.equal(values["{sorumlu}"], "");

console.log("document reminder schedule ok");
