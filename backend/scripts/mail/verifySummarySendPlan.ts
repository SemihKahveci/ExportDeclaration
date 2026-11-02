import assert from "node:assert/strict";
import { cutoffNotice, istanbulStamp, summaryHoldActive, summaryMailRow, summaryTableHtml, summaryTableText } from "../../src/modules/mail/summaryMailFormat.js";
import { readSummaryPlan, summarizePlan, summaryDueSlot } from "../../src/modules/mail/summarySendPlan.js";

const weekdays = readSummaryPlan({
  dayMode: "weekdays",
  firstMinutes: "08:00",
  repeat: "every-2h",
  lastMinutes: "16:00",
  cutoffEnabled: false
});
assert.deepEqual(weekdays.issues, []);
assert.deepEqual(summarizePlan(weekdays.plan!).slots, ["08:00", "10:00", "12:00", "14:00", "16:00"]);

const untilSeventeen = readSummaryPlan({
  dayMode: "weekdays",
  firstMinutes: "08:00",
  repeat: "every-2h",
  lastMinutes: "17:00"
});
assert.deepEqual(summarizePlan(untilSeventeen.plan!).slots, ["08:00", "10:00", "12:00", "14:00", "16:00"]);
assert.equal(summarizePlan(untilSeventeen.plan!).lastHourIncluded, false);

const untilEighteen = readSummaryPlan({
  dayMode: "weekdays",
  firstMinutes: "08:00",
  repeat: "every-2h",
  lastMinutes: "18:00"
});
assert.equal(summarizePlan(untilEighteen.plan!).slots.at(-1), "18:00");
assert.equal(summarizePlan(untilEighteen.plan!).lastHourIncluded, true);

const once = readSummaryPlan({ dayMode: "every", firstMinutes: "10:00", repeat: "once" });
assert.deepEqual(summarizePlan(once.plan!).slots, ["10:00"]);
assert.match(summarizePlan(once.plan!).preview, /günde 1 mail/);

const crossed = readSummaryPlan({
  dayMode: "every",
  firstMinutes: "22:00",
  repeat: "every-2h",
  lastMinutes: "02:00"
});
assert.equal(crossed.plan, null);
assert.ok(crossed.issues.some((issue) => issue.includes("gece yarısı")));

const custom = readSummaryPlan({
  dayMode: "custom",
  customDays: [1, 3, 5],
  firstMinutes: "09:00",
  repeat: "once"
});
assert.match(summarizePlan(custom.plan!).preview, /Pzt · Çar · Cum/);

const wednesdayMorning = new Date("2026-10-28T07:05:00.000Z");
assert.equal(
  summaryDueSlot(once.plan!, wednesdayMorning, new Set()),
  "summary:2026-10-28:10:00"
);
assert.equal(
  summaryDueSlot(once.plan!, wednesdayMorning, new Set(["summary:2026-10-28:10:00"])),
  null
);
assert.equal(summaryDueSlot(weekdays.plan!, new Date("2026-10-31T07:05:00.000Z"), new Set()), null);
assert.equal(
  summaryDueSlot(weekdays.plan!, new Date("2026-10-28T07:30:00.000Z"), new Set()),
  "summary:2026-10-28:10:00"
);
assert.equal(summaryDueSlot(weekdays.plan!, new Date("2026-10-28T04:30:00.000Z"), new Set()), null);

const older = summaryMailRow({
  ref: "A",
  declarationNo: "",
  createdAt: new Date("2026-10-01T09:00:00.000Z"),
  missing: ["Çeki Listesi", "ATR"],
  gtipCount: 0
});
const newer = summaryMailRow({
  ref: "B",
  declarationNo: "26-1",
  createdAt: new Date("2026-10-20T09:00:00.000Z"),
  missing: [],
  gtipCount: 2,
  gtipSummary: "M1 · Kumaş · 1111"
});
assert.ok(older && newer);
assert.equal(older.declarationNo, "—");
assert.equal(older.status, "Eksik Evrak");
assert.equal(newer.status, "GTİP Hatalı");
assert.equal(newer.waiting, "M1 · Kumaş · 1111");
assert.equal(summaryMailRow({
  ref: "D",
  createdAt: new Date("2026-10-20T09:00:00.000Z"),
  missing: ["ATR"],
  gtipCount: 2,
  gtipSummary: "M1 · Kumaş · 1111"
})?.waiting, "ATR · M1 · Kumaş · 1111");
const text = summaryTableText([newer, older]);
assert.ok(text.indexOf("A |") < text.indexOf("B |"));
const html = summaryTableHtml([older]);
assert.match(html, /width="600"/);
assert.doesNotMatch(html, /<img/i);
assert.equal(summaryMailRow({ ref: "C", createdAt: new Date(), missing: [], gtipCount: 0 }), null);
assert.equal(summaryHoldActive(new Date(wednesdayMorning.getTime() - 30 * 60 * 1000), wednesdayMorning), true);
assert.equal(summaryHoldActive(new Date(wednesdayMorning.getTime() - 3 * 60 * 60 * 1000), wednesdayMorning), false);
assert.match(istanbulStamp(wednesdayMorning, true), /^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/);
assert.match(cutoffNotice(new Date(wednesdayMorning.getTime() + 3 * 60 * 60 * 1000), wednesdayMorning), /3 saat kaldı/);

console.log("summary send plan ok");
