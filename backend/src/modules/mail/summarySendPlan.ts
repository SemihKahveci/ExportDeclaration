import { istanbulClock } from "./documentReminderSchedule.js";

export const SUMMARY_DAY_MODES = ["every", "weekdays", "weekend", "custom"] as const;
export const SUMMARY_REPEATS = ["once", "every-2h"] as const;
export const SUMMARY_INTERVAL_MINUTES = 120;
const DAY_MINUTES = 24 * 60;

export type SummaryDayMode = (typeof SUMMARY_DAY_MODES)[number];
export type SummaryRepeat = (typeof SUMMARY_REPEATS)[number];

export interface SummarySendPlan {
  dayMode: SummaryDayMode;
  customDays: number[];
  firstMinutes: number;
  repeat: SummaryRepeat;
  lastMinutes: number | null;
  cutoffEnabled: boolean;
  cutoffLeadHours: number;
}

export interface SummaryPlanPreview {
  slots: string[];
  preview: string;
  lastHourIncluded: boolean;
}

const DAY_LABELS = ["", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

function clockMinutes(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value < DAY_MINUTES) return value;
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function formatMinutes(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function summarySlotMinutes(plan: SummarySendPlan): number[] {
  if (plan.repeat === "once") return [plan.firstMinutes];
  const last = plan.lastMinutes ?? plan.firstMinutes;
  const slots: number[] = [];
  for (let cursor = plan.firstMinutes; cursor <= last; cursor += SUMMARY_INTERVAL_MINUTES) slots.push(cursor);
  return slots;
}

export function istanbulWeekday(date: Date): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    weekday: "short"
  }).format(date);
  const index = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(name);
  return index + 1;
}

export function planSendsOn(plan: SummarySendPlan, date: Date): boolean {
  const day = istanbulWeekday(date);
  if (plan.dayMode === "every") return true;
  if (plan.dayMode === "weekdays") return day >= 1 && day <= 5;
  if (plan.dayMode === "weekend") return day === 6 || day === 7;
  return plan.customDays.includes(day);
}

export function summarizePlan(plan: SummarySendPlan): SummaryPlanPreview {
  const minutes = summarySlotMinutes(plan);
  const slots = minutes.map(formatMinutes);
  const times = slots.join(" · ");
  const count = `${slots.length} mail`;
  const last = plan.repeat === "every-2h" ? plan.lastMinutes : null;
  const lastHourIncluded = last == null || minutes.includes(last);
  let preview = `${times} — günde ${count}`;
  if (plan.dayMode === "weekdays" && plan.repeat === "once") {
    preview = `Pzt–Cum ${times} — günde ${count}. Cumartesi ve pazar mail gitmez.`;
  } else if (plan.dayMode === "weekend" && plan.repeat === "once") {
    preview = `Cmt–Paz ${times} — günde ${count}. Hafta içi mail gitmez.`;
  } else if (plan.dayMode === "custom") {
    const names = plan.customDays.map((day) => DAY_LABELS[day]).filter(Boolean).join(" · ");
    preview = `Yalnız ${names} günlerinde ${times}. Diğer günler mail gitmez.`;
  } else if (plan.dayMode === "weekdays") {
    preview = `Hafta içi ${times} — günde ${count}`;
  } else if (plan.dayMode === "weekend") {
    preview = `Hafta sonu ${times} — günde ${count}`;
  }
  if (!lastHourIncluded && last != null) {
    preview = `${preview}. ${formatMinutes(last)} adıma denk gelmediği için gitmez.`;
  }
  return { slots, preview, lastHourIncluded };
}

export function summaryDueSlot(plan: SummarySendPlan, now: Date, sent: ReadonlySet<string>): string | null {
  if (!planSendsOn(plan, now)) return null;
  const clock = istanbulClock(now);
  const due = summarySlotMinutes(plan)
    .filter((minutes) => clock.minutes >= minutes)
    .sort((left, right) => right - left);
  if (due.length === 0) return null;
  const key = `summary:${clock.dateKey}:${formatMinutes(due[0]!)}`;
  return sent.has(key) ? null : key;
}

export function readSummaryPlan(body: unknown): { plan: SummarySendPlan | null; issues: string[] } {
  const source = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const issues: string[] = [];
  const dayMode = SUMMARY_DAY_MODES.includes(source.dayMode as SummaryDayMode)
    ? source.dayMode as SummaryDayMode
    : null;
  if (!dayMode) issues.push("Gün seçimi gerekli.");

  const customDays = [...new Set(
    (Array.isArray(source.customDays) ? source.customDays : [])
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
  )].sort((left, right) => left - right);
  if (dayMode === "custom" && customDays.length === 0) issues.push("En az bir gün seçilmeli.");

  const firstMinutes = clockMinutes(source.firstMinutes);
  if (firstMinutes == null) issues.push("İlk gönderim saati gerekli.");

  const repeat = SUMMARY_REPEATS.includes(source.repeat as SummaryRepeat)
    ? source.repeat as SummaryRepeat
    : null;
  if (!repeat) issues.push("Tekrar seçimi gerekli.");

  const lastMinutes = source.lastMinutes == null || source.lastMinutes === ""
    ? null
    : clockMinutes(source.lastMinutes);
  if (repeat === "every-2h" && lastMinutes == null) issues.push("Son gönderim saati gerekli.");
  if (repeat === "every-2h" && firstMinutes != null && lastMinutes != null && lastMinutes < firstMinutes) {
    issues.push("Son saat ilk saatten önce olamaz. Plan gece yarısını geçemez.");
  }

  const cutoffEnabled = source.cutoffEnabled === true;
  const lead = Number(source.cutoffLeadHours);
  const cutoffLeadHours = Number.isInteger(lead) && lead >= 1 && lead <= 72 ? lead : 4;
  if (cutoffEnabled && !(Number.isInteger(lead) && lead >= 1 && lead <= 72)) {
    issues.push("Cut-off uyarısı 1 ile 72 saat arasında seçilir.");
  }

  if (issues.length > 0 || !dayMode || firstMinutes == null || !repeat) return { plan: null, issues };
  return {
    plan: {
      dayMode,
      customDays: dayMode === "custom" ? customDays : [],
      firstMinutes,
      repeat,
      lastMinutes: repeat === "every-2h" ? lastMinutes : null,
      cutoffEnabled,
      cutoffLeadHours
    },
    issues: []
  };
}
